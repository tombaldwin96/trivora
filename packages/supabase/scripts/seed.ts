/**
 * Seed script: run against local or remote Supabase.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Usage: pnpm exec tsx scripts/seed.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function runSeed() {
  const sqlPath = join(process.cwd(), '..', '..', 'supabase', 'seed.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    if (stmt.toUpperCase().startsWith('INSERT')) {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).catch(() => ({ error: 'rpc_not_available' }));
      if (error) {
        console.warn('Note: exec_sql not available. Run seed.sql manually in Supabase SQL editor.');
        console.log('Copy contents of supabase/seed.sql into Dashboard > SQL Editor and run.');
        break;
      }
    }
  }

  console.log('Seeding categories...');
  const categories = [
    { id: 'a0000000-0000-0000-0000-000000000001', name: 'General Knowledge', slug: 'general', is_active: true, sort_order: 1 },
    { id: 'a0000000-0000-0000-0000-000000000002', name: 'Science', slug: 'science', is_active: true, sort_order: 2 },
    { id: 'a0000000-0000-0000-0000-000000000003', name: 'History', slug: 'history', is_active: true, sort_order: 3 },
  ];
  for (const c of categories) {
    await supabase.from('categories').upsert(c, { onConflict: 'id' });
  }

  console.log('Seeding questions...');
  const questions = [
    { id: 'b0000000-0000-0000-0000-000000000001', category_id: 'a0000000-0000-0000-0000-000000000001', prompt: 'What is the capital of France?', answers_json: ['London', 'Berlin', 'Paris', 'Madrid'], correct_index: 2, explanation: 'Paris is the capital of France.', difficulty: 1, time_limit_ms: 15000, is_active: true },
    { id: 'b0000000-0000-0000-0000-000000000002', category_id: 'a0000000-0000-0000-0000-000000000001', prompt: 'How many continents are there?', answers_json: ['5', '6', '7', '8'], correct_index: 2, explanation: 'There are 7 continents.', difficulty: 1, time_limit_ms: 15000, is_active: true },
  ];
  for (const q of questions) {
    await supabase.from('questions').upsert(q, { onConflict: 'id' });
  }

  console.log('Seeding seasons...');
  const seasonStarts = new Date();
  const seasonEnds = new Date(seasonStarts);
  seasonEnds.setFullYear(seasonEnds.getFullYear() + 1);
  for (let div = 1; div <= 5; div++) {
    await supabase.from('seasons').upsert({
      id: `c0000000-0000-0000-0000-00000000000${div}`,
      mode: '1v1',
      division: div,
      season_number: 1,
      starts_at: seasonStarts.toISOString(),
      ends_at: seasonEnds.toISOString(),
    }, { onConflict: 'id' });
  }

  console.log('Seed complete.');
}

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
