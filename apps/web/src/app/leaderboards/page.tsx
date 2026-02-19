import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@mahan/ui';
import Link from 'next/link';

export default async function LeaderboardsPage() {
  const supabase = await createServerSupabaseClient();

  const today = new Date().toISOString().slice(0, 10);
  const { data: daily } = await supabase
    .from('leaderboard_daily')
    .select('user_id, score, rank')
    .eq('date', today)
    .order('rank')
    .limit(20);

  type DailyRow = { user_id: string; score: number; rank: number };
  const dailyRows = (daily ?? []) as DailyRow[];
  const userIds = dailyRows.map((r) => r.user_id).filter(Boolean);
  type ProfileRow = { id: string; username?: string; display_name?: string };
  const { data: profilesData } = userIds.length
    ? await supabase.from('profiles').select('id, username, display_name').in('id', userIds)
    : { data: [] as ProfileRow[] };
  const profiles = (profilesData ?? []) as ProfileRow[];
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Leaderboards</h1>
      <div className="flex gap-2 mb-4">
        <span className="rounded-lg bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">Daily</span>
        <Link href="/leaderboards/season" className="rounded-lg px-3 py-1 text-sm text-slate-600 hover:bg-slate-100">Season</Link>
      </div>
      <Card className="p-4">
        <h2 className="font-semibold mb-4">Today&apos;s top scores</h2>
        {!dailyRows.length ? (
          <p className="text-slate-500">No scores yet today. Be the first!</p>
        ) : (
          <ul className="space-y-2">
            {dailyRows.map((row) => (
              <li key={row.user_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="font-medium">#{row.rank}</span>
                <span>{profileMap[row.user_id]?.display_name || profileMap[row.user_id]?.username || 'Anonymous'}</span>
                <span className="text-brand-600 font-semibold">{row.score} pts</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Link href="/dashboard"><span className="text-sm text-slate-500 hover:underline mt-4 inline-block">Back to dashboard</span></Link>
    </div>
  );
}
