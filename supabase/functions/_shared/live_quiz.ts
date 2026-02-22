import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Service role client for server-authoritative writes (answers, scores, state, audit). */
export function getSupabaseService() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

/** Live quiz scoring: base + time bonus. Faster correct = more points. */
const BASE_POINTS = 100;
const MAX_TIME_BONUS = 50;
const MIN_ELAPSED_MS = 120;

export function computeLiveScore(
  correct: boolean,
  elapsedMs: number,
  durationMs: number
): number {
  if (!correct) return 0;
  const clamped = Math.max(MIN_ELAPSED_MS, Math.min(elapsedMs, durationMs));
  const bonus = durationMs > 0
    ? Math.round(MAX_TIME_BONUS * (1 - clamped / durationMs))
    : 0;
  return BASE_POINTS + Math.max(0, bonus);
}
