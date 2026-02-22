import { createServerClient } from '@supabase/ssr';
import type { Database } from '@trivora/supabase';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/** Same format as Supabase import: Category, Sub category, Question, Option 1 (correct), Option 2–4, Language, Difficulty, Appeal */
const COL = { category: 0, subCategory: 1, prompt: 2, opt1: 3, opt2: 4, opt3: 5, opt4: 6, language: 7, difficulty: 8, appeal: 9 };

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

function shuffleWithCorrect<T>(arr: T[], correctIndex: number): { shuffled: T[]; newCorrectIndex: number } {
  const copy = [...arr];
  const correct = copy[correctIndex];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return { shuffled: copy, newCorrectIndex: copy.indexOf(correct) };
}

function cellStr(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  return String(val).trim();
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient<Database>(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });
    const db = supabase as any;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!(profile as { is_admin?: boolean } | null)?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const sessionId = formData.get('session_id') as string | null;
    const file = formData.get('file') as File | null;

    if (!sessionId?.trim()) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }
    if (!file?.size) {
      return NextResponse.json({ error: 'Missing or empty file' }, { status: 400 });
    }

    const fileName = (file.name || '').toLowerCase();
    const isXlsx = fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');
    if (!isXlsx && !isCsv) {
      return NextResponse.json({ error: 'File must be .csv or .xlsx' }, { status: 400 });
    }

    let dataRows: string[][];

    if (isXlsx) {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        return NextResponse.json({ error: 'XLSX has no sheets' }, { status: 400 });
      }
      const sheet = wb.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as unknown[][];
      if (rows.length < 2) {
        return NextResponse.json({ error: 'Sheet needs header + at least one row' }, { status: 400 });
      }
      dataRows = rows.slice(1).map((row) => (Array.isArray(row) ? row : []).map(cellStr));
    } else {
      const raw = await file.text();
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        return NextResponse.json({ error: 'CSV needs header + at least one row' }, { status: 400 });
      }
      dataRows = lines.slice(1).map(parseCsvLine);
    }

    const existingKey = (p: string, cid: string) => p + '\0' + cid;
    const existingSet = new Set<string>();
    const { data: existingPage } = await db.from('questions').select('prompt, category_id').limit(2000);
    for (const row of (existingPage ?? []) as { prompt: string; category_id: string }[]) {
      existingSet.add(existingKey(row.prompt, row.category_id));
    }

    const categoryByName = new Map<string, string>();

    const getOrCreateCategory = async (name: string): Promise<string> => {
      const n = name.trim();
      if (!n) return getOrCreateCategory('General');
      if (categoryByName.has(n)) return categoryByName.get(n)!;
      const slug = slugify(n);
      const { data: existing } = await db.from('categories').select('id').eq('slug', slug).maybeSingle();
      const existingRow = existing as { id: string } | null;
      if (existingRow?.id) {
        categoryByName.set(n, existingRow.id);
        return existingRow.id;
      }
      const { data: inserted, error } = await db
        .from('categories')
        .insert({ name: n, slug, is_active: true, sort_order: 999 })
        .select('id')
        .single();
      if (error) throw error;
      const insertedRow = inserted as { id: string } | null;
      if (!insertedRow?.id) throw new Error('No id for category');
      categoryByName.set(n, insertedRow.id);
      return insertedRow.id;
    };

    const { data: existingPositions } = await db
      .from('live_quiz_session_questions')
      .select('position')
      .eq('session_id', sessionId)
      .order('position', { ascending: false })
      .limit(1);
    let nextPosition = 0;
    if (existingPositions?.length && typeof (existingPositions[0] as { position: number }).position === 'number') {
      nextPosition = (existingPositions[0] as { position: number }).position + 1;
    }

    let questionsCreated = 0;
    let addedToSession = 0;
    let skipped = 0;

    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const get = (col: number) => String(row?.[col] ?? '').trim();

      const categoryName = get(COL.category);
      const subCategory = get(COL.subCategory);
      const prompt = get(COL.prompt);
      const opt1 = get(COL.opt1);
      const opt2 = get(COL.opt2);
      const opt3 = get(COL.opt3);
      const opt4 = get(COL.opt4);
      const difficultyRaw = get(COL.difficulty);
      const appealRaw = get(COL.appeal);
      const language = get(COL.language);

      if (!prompt || !opt1) {
        skipped++;
        continue;
      }

      const options = [opt1, opt2, opt3, opt4].map((o) => String(o).trim()).filter((s) => s.length > 0);
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
      } catch {
        skipped++;
        continue;
      }

      if (existingSet.has(existingKey(prompt, categoryId))) {
        const { data: existingQ } = await db
          .from('questions')
          .select('id')
          .eq('prompt', prompt)
          .eq('category_id', categoryId)
          .maybeSingle();
        const existingQRow = existingQ as { id: string } | null;
        if (existingQRow?.id) {
          const { error: linkErr } = await db.from('live_quiz_session_questions').insert({
            session_id: sessionId,
            question_id: existingQRow.id,
            position: nextPosition++,
          });
          if (!linkErr) addedToSession++;
        }
        skipped++;
        continue;
      }

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

      const { data: newQuestion, error: insertErr } = await db.from('questions').insert(insertRow).select('id').single();
      if (insertErr) {
        skipped++;
        continue;
      }
      questionsCreated++;
      existingSet.add(existingKey(prompt, categoryId));

      const { error: linkErr } = await db.from('live_quiz_session_questions').insert({
        session_id: sessionId,
        question_id: (newQuestion as { id: string }).id,
        position: nextPosition++,
      });
      if (!linkErr) addedToSession++;
    }

    return NextResponse.json({
      ok: true,
      addedToSession,
      questionsCreated,
      skipped,
      totalRows: dataRows.length,
    });
  } catch (e) {
    console.error('upload-questions', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
