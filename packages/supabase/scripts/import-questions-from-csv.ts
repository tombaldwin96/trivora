/**
 * Import questions from a CSV exported from Google Sheets.
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
 *   1. In Google Sheets: File → Download → Comma-separated values (.csv)
 *   2. From repo root: pnpm --filter @mahan/supabase exec tsx scripts/import-questions-from-csv.ts path/to/questions.csv
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY with insert rights).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
  process.exit(1);
}

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

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: tsx scripts/import-questions-from-csv.ts <path-to.csv>');
    process.exit(1);
  }

  const fullPath = resolve(process.cwd(), csvPath);
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

  const header = parseCsvLine(lines[0]);
  const dataRows = lines.slice(1).map(parseCsvLine);

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
  let skipped = 0;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const get = (col: number) => (row[col] ?? '').trim();

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
      skipped++;
      continue;
    }

    const options = [opt1, opt2, opt3, opt4].filter(Boolean);
    if (options.length < 2) {
      skipped++;
      continue;
    }

    const { shuffled: answers, newCorrectIndex } = shuffleWithCorrect(options, 0);

    const difficulty = Math.min(5, Math.max(1, parseInt(difficultyRaw, 10) || 2));
    const appealNum = appealRaw ? parseInt(appealRaw, 10) : NaN;
    const appeal = Number.isNaN(appealNum) ? null : Math.min(5, Math.max(1, appealNum));

    let categoryId: string;
    try {
      categoryId = await getOrCreateCategory(categoryName || 'General');
    } catch (e) {
      console.warn('Row', r + 2, 'category error:', e);
      skipped++;
      continue;
    }

    const { error } = await supabase.from('questions').insert({
      category_id: categoryId,
      prompt,
      answers_json: answers,
      correct_index: newCorrectIndex,
      difficulty,
      time_limit_ms: 15000,
      is_active: true,
      sub_category: subCategory || null,
      language: language || null,
      appeal: appeal ?? null,
    });

    if (error) {
      console.warn('Row', r + 2, 'insert error:', error.message);
      skipped++;
      continue;
    }
    inserted++;
    if (inserted % 100 === 0) console.log('Inserted', inserted, '...');
  }

  console.log('Done. Inserted:', inserted, 'Skipped:', skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
