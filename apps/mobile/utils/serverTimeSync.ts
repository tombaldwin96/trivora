/**
 * Server time sync for deterministic intro/outro timing across devices.
 * Uses get_server_time() RPC to compute offset; then estimatedServerTime() uses local clock + offset.
 */
import { supabase } from '@/lib/supabase';

let cachedOffsetMs: number | null = null;
const CACHE_TTL_MS = 30_000; // Re-sync every 30s during long sessions
let lastSyncAt = 0;

/**
 * Fetch current server time and update cached offset (server - device).
 * Call when match is confirmed or when starting intro/outro.
 */
export async function syncServerTime(): Promise<number> {
  const client = supabase;
  const before = Date.now();
  const { data, error } = await client.rpc('get_server_time');
  const after = Date.now();
  if (error || data == null) {
    return cachedOffsetMs ?? 0;
  }
  const serverMs = new Date(data as string).getTime();
  const rtt = after - before;
  const mid = before + rtt / 2;
  cachedOffsetMs = serverMs - mid;
  lastSyncAt = Date.now();
  return cachedOffsetMs;
}

/**
 * Invalidate cache so next estimatedServerTime() will trigger a sync (caller can await syncServerTime()).
 */
export function invalidateServerTimeCache(): void {
  cachedOffsetMs = null;
}

/**
 * Estimated server time in ms (epoch). Uses cached offset; if cache is stale or missing, returns device time.
 * For best accuracy, call syncServerTime() when match is found / when showing intro.
 */
export function estimatedServerTimeMs(): number {
  const now = Date.now();
  if (cachedOffsetMs == null) return now;
  if (now - lastSyncAt > CACHE_TTL_MS) return now; // Stale: don't use offset
  return now + cachedOffsetMs;
}

/**
 * Whether intro should be skipped because match_start_at has already passed (e.g. slow load).
 */
export function shouldSkipIntro(matchStartAt: string): boolean {
  const serverNow = estimatedServerTimeMs();
  const startMs = new Date(matchStartAt).getTime();
  return serverNow >= startMs;
}

/**
 * Milliseconds until a server timestamp (positive = in future, negative = in past).
 */
export function msUntilServerTimestamp(isoString: string): number {
  const targetMs = new Date(isoString).getTime();
  return targetMs - estimatedServerTimeMs();
}
