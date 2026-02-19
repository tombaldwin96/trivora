import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@mahan/ui';
import Link from 'next/link';
import { DIVISION_NAMES } from '@mahan/core';

export default async function SeasonLeaderboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: standingsData } = await supabase
    .from('standings')
    .select('user_id, division, points, games_played, wins, draws, losses')
    .order('points', { ascending: false })
    .limit(50);

  type StandingRow = { user_id: string; division: number; points: number; games_played: number; wins: number; draws: number; losses: number };
  type ProfileRow = { id: string; username?: string; display_name?: string };
  const standings = (standingsData ?? []) as StandingRow[];
  const userIds = standings.map((s) => s.user_id).filter(Boolean);
  const { data: profilesData } = userIds.length
    ? await supabase.from('profiles').select('id, username, display_name').in('id', userIds)
    : { data: [] as ProfileRow[] };
  const profiles = (profilesData ?? []) as ProfileRow[];
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Season leaderboard (1v1)</h1>
      <div className="flex gap-2 mb-4">
        <Link href="/leaderboards" className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Daily</Link>
        <span className="rounded-lg bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">Season</span>
      </div>
      <Card className="p-4">
        {!standings.length ? (
          <p className="text-slate-500">No season data yet.</p>
        ) : (
          <ul className="space-y-2">
            {standings.map((row, i) => (
              <li key={row.user_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="font-medium">#{i + 1}</span>
                <span>{profileMap[row.user_id]?.display_name || profileMap[row.user_id]?.username || 'Anonymous'}</span>
                <span className="text-xs text-slate-500">Div {row.division} ({DIVISION_NAMES[row.division] ?? '—'})</span>
                <span className="text-brand-600 font-semibold">{row.points} pts</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Link href="/leaderboards" className="text-sm text-slate-500 hover:underline mt-4 inline-block">Back to leaderboards</Link>
    </div>
  );
}
