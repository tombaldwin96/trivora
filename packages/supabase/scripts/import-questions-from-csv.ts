/**
 * Import questions from a CSV or XLSX file (e.g. from Excel or Google Sheets).
 *
 * Sheet columns:
 *   A = Category
 *   B = Sub category
 *   C = Question
 *   D = option 1 (correct)
 *   E = option 2, F = option 3, G = option 4
 *   H = language
 *   I = difficulty (1-5)
 *   J = appeal (1-5)
 *
 * Usage:
 *   From repo root: pnpm --filter @trivora/supabase exec tsx scripts/import-questions-from-csv.ts path/to/questions.csv
 *   Or with Excel:  pnpm --filter @trivora/supabase exec tsx scripts/import-questions-from-csv.ts path/to/questions.xlsx
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY with insert rights).
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';

// Load .env from current dir, repo root, or apps/mobile (so you can run from mobile folder)
const cwd = process.cwd();
[
  resolve(cwd, '.env'),
  resolve(cwd, '.env.local'),
  resolve(cwd, '../../.env'),
  resolve(cwd, '../../.env.local'),
  resolve(cwd, '../../apps/mobile/.env'),
  resolve(cwd, '../../apps/mobile/.env.local'),
].forEach((p) => config({ path: p }));

const url =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
  process.exit(1);
}

const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') {
            end += 2;
            continue;
          }
          break;
        }
        end++;
      }
      out.push(line.slice(i + 1, end).replace(/""/g, '"').trim());
      i = end + 1;
      if (line[i] === ',') i++;
      continue;
    }
    const comma = line.indexOf(',', i);
    if (comma === -1) {
      out.push(line.slice(i).trim());
      break;
    }
    out.push(line.slice(i, comma).trim());
    i = comma + 1;
  }
  return out;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'uncategorized';
}

/** Shuffle array and return the new index of the first element (correct answer). */
function shuffleWithCorrect<T>(arr: T[], correctIndex: number): { shuffled: T[]; newCorrectIndex: number } {
  const copy = [...arr];
  const correct = copy[correctIndex];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const newCorrectIndex = copy.indexOf(correct);
  return { shuffled: copy, newCorrectIndex };
}

/** Normalize a cell value to trimmed string (XLSX can return number/date). */
function cellStr(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  return String(val).trim();
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--verbose');
  const verbose = process.argv.includes('--verbose');
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: tsx scripts/import-questions-from-csv.ts [--verbose] <path-to.csv-or.xlsx>');
    process.exit(1);
  }

  const fullPath = resolve(process.cwd(), filePath);
  const isXlsx = /\.xlsx$/i.test(fullPath);

  let dataRows: string[][];

  if (isXlsx) {
    let buf: Buffer;
    try {
      buf = readFileSync(fullPath);
    } catch (e) {
      console.error('Failed to read file:', fullPath, e);
      process.exit(1);
    }
    const wb = XLSX.read(buf, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) {
      console.error('XLSX has no sheets');
      process.exit(1);
    }
    const sheet = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as unknown[][];
    if (rows.length < 2) {
      console.error('Sheet has no data rows (need header + at least one row)');
      process.exit(1);
    }
    dataRows = rows.slice(1).map((row) => (Array.isArray(row) ? row : []).map(cellStr));
  } else {
    let raw: string;
    try {
      raw = readFileSync(fullPath, 'utf-8');
    } catch (e) {
      console.error('Failed to read file:', fullPath, e);
      process.exit(1);
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      console.error('CSV has no data rows (need header + at least one row)');
      process.exit(1);
    }
    dataRows = lines.slice(1).map(parseCsvLine);
  }

  console.log('Read', dataRows.length, 'rows. Loading existing questions to avoid duplicates...');
  const existingKey = (p: string, cid: string) => p + '\0' + cid;
  const existingSet = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data: page } = await supabase.from('questions').select('prompt, category_id').range(offset, offset + pageSize - 1);
    if (!page?.length) break;
    for (const row of page as { prompt: string; category_id: string }[]) {
      existingSet.add(existingKey(row.prompt, row.category_id));
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  console.log('Found', existingSet.size, 'existing questions. Importing...');

  const categoryByName = new Map<string, string>();

  const getOrCreateCategory = async (name: string): Promise<string> => {
    const n = name.trim();
    if (!n) throw new Error('Empty category name');
    if (categoryByName.has(n)) return categoryByName.get(n)!;

    const slug = slugify(n);
    const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).maybeSingle();
    if (existing?.id) {
      categoryByName.set(n, existing.id);
      return existing.id;
    }

    const { data: inserted, error } = await supabase
      .from('categories')
      .insert({ name: n, slug, is_active: true, sort_order: 999 })
      .select('id')
      .single();

    if (error) throw error;
    if (!inserted?.id) throw new Error('No id returned for category');
    categoryByName.set(n, inserted.id);
    return inserted.id;
  };

  let inserted = 0;
  const skipReasons = { missingPromptOrOpt1: 0, fewerThan2Options: 0, categoryError: 0, duplicate: 0, insertError: 0 };
  const verboseSamples: { reason: string; row: number; cols: string[] }[] = [];
  const maxSamples = 5;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    // Coerce to string so numeric cells (e.g. Excel number 0 or 7) are never treated as empty or dropped
    const get = (col: number) => String(row[col] ?? '').trim();

    const categoryName = get(0);  // A
    const subCategory = get(1);  // B
    const prompt = get(2);       // C
    const opt1 = get(3);         // D (correct)
    const opt2 = get(4);         // E
    const opt3 = get(5);         // F
    const opt4 = get(6);         // G
    const language = get(7);     // H
    const difficultyRaw = get(8); // I
    const appealRaw = get(9);    // J

    if (!prompt || !opt1) {
      skipReasons.missingPromptOrOpt1++;
      if (verbose && verboseSamples.filter((s) => s.reason === 'missingPromptOrOpt1').length < maxSamples) {
        verboseSamples.push({ reason: 'missingPromptOrOpt1', row: r + 2, cols: [categoryName, subCategory, prompt, opt1].slice(0, 4) });
      }
      continue;
    }

    // Keep all non-empty options as strings (so "0" and numeric 0 both count; filter(Boolean) would drop number 0)
    const options = [opt1, opt2, opt3, opt4].map((o) => String(o).trim()).filter((s) => s.length > 0);
    if (options.length < 2) {
      skipReasons.fewerThan2Options++;
      if (verbose && verboseSamples.filter((s) => s.reason === 'fewerThan2Options').length < maxSamples) {
        verboseSamples.push({ reason: 'fewerThan2Options', row: r + 2, cols: [categoryName, prompt, opt1, opt2, opt3, opt4].slice(0, 6) });
      }
      continue;
    }

    const { shuffled: answers, newCorrectIndex } = shuffleWithCorrect(options, 0);

    const difficulty = Math.min(5, Math.max(1, parseInt(difficultyRaw, 10) || 2));
    const appealNum = appealRaw ? parseInt(appealRaw, 10) : NaN;
    const appeal = Number.isNaN(appealNum) ? null : Math.min(5, Math.max(1, appealNum));

    let categoryId: string;
    try {
      categoryId = await getOrCreateCategory(categoryName || 'General');
    } catch (e: unknown) {
      if (!isServiceRole && typeof e === 'object' && e !== null && (e as { code?: string }).code === '42501') {
        console.error('\nRow-level security blocked insert. Use SUPABASE_SERVICE_ROLE_KEY in your .env (not the anon key). Get it from Supabase Dashboard → Project Settings → API → service_role.\n');
        process.exit(1);
      }
      console.warn('Row', r + 2, 'category error:', e);
      skipReasons.categoryError++;
      continue;
    }

    // Skip if same question (same prompt + category) already exists so re-runs don't duplicate
    if (existingSet.has(existingKey(prompt, categoryId))) {
      skipReasons.duplicate++;
      continue;
    }

    // Insert all fields; appeal, sub_category, language require migration 20250216000002 to be applied (see README).
    const insertRow: Record<string, unknown> = {
      category_id: categoryId,
      prompt,
      answers_json: answers,
      correct_index: newCorrectIndex,
      difficulty,
      time_limit_ms: 15000,
      is_active: true,
    };
    if (subCategory.length > 0) insertRow.sub_category = subCategory;
    if (language.length > 0) insertRow.language = language;
    if (appeal != null) insertRow.appeal = appeal;

    const { error } = await supabase.from('questions').insert(insertRow);

    if (error) {
      console.warn('Row', r + 2, 'insert error:', error.message);
      skipReasons.insertError++;
      continue;
    }
    inserted++;
    if (inserted % 100 === 0) console.log('Inserted', inserted, '...');
  }

  const totalSkipped = skipReasons.missingPromptOrOpt1 + skipReasons.fewerThan2Options + skipReasons.categoryError + skipReasons.duplicate + skipReasons.insertError;
  console.log('Done. Inserted:', inserted, 'Skipped:', totalSkipped);
  if (totalSkipped > 0) {
    console.log('Skip reasons:');
    if (skipReasons.missingPromptOrOpt1) console.log('  - missing question or option 1:', skipReasons.missingPromptOrOpt1);
    if (skipReasons.fewerThan2Options) console.log('  - fewer than 2 answer options:', skipReasons.fewerThan2Options);
    if (skipReasons.categoryError) console.log('  - category create/lookup failed:', skipReasons.categoryError);
    if (skipReasons.duplicate) console.log('  - already exists (same question + category):', skipReasons.duplicate);
    if (skipReasons.insertError) console.log('  - question insert failed:', skipReasons.insertError);
  }
  if (verbose && verboseSamples.length > 0) {
    console.log('\nSample skipped rows (--verbose):');
    for (const s of verboseSamples) {
      console.log('  Row', s.row, s.reason + ':', JSON.stringify(s.cols));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
