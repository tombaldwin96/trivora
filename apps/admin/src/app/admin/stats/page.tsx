import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabase } from '@/lib/supabase';
import { OnlineUsersChart } from './OnlineUsersChart';

export default async function AdminStatsPage() {
  const supabase = await createAdminSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) redirect('/');

  // Record current hour snapshot so graph has data (idempotent).
  await (supabase as any).rpc('record_online_snapshot').catch(() => {});

  const [
    { data: currentOnline },
    { data: snapshots },
    { data: gameModePlays },
    { data: screenStats },
    { data: byCountry },
    { data: byUkCity },
  ] = await Promise.all([
    (supabase as any).rpc('get_admin_current_online'),
    (supabase as any).rpc('get_admin_online_snapshots', { p_hours: 24 }),
    (supabase as any).rpc('get_admin_game_mode_plays'),
    (supabase as any).rpc('get_admin_screen_view_stats'),
    (supabase as any).rpc('get_admin_connections_by_country'),
    (supabase as any).rpc('get_admin_connections_by_uk_city'),
  ]);

  const current = (currentOnline ?? 0) as number;
  const snapshotRows = (snapshots ?? []) as { bucket_utc: string; user_count: number }[];
  const gameModes = (gameModePlays ?? []) as { mode_name: string; play_count: number }[];
  const screens = (screenStats ?? []) as { screen_or_path: string; event_count: number }[];
  const countries = (byCountry ?? []) as { country_code: string; connection_count: number }[];
  const ukCities = (byUkCity ?? []) as { city_name: string; connection_count: number }[];

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Stats &amp; analytics</h1>

      {/* Online user stats + graph */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Online users</h2>
        <p className="text-slate-600 text-sm mb-2">
          Users active in the last 10 minutes. Graph shows highest count per hour (record a snapshot hourly for full history).
        </p>
        <div className="rounded-lg border bg-white p-4 mb-2">
          <span className="text-3xl font-bold text-indigo-600">{current}</span>
          <span className="text-slate-600 ml-2">online now</span>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Online users per hour (last 24h)</p>
          <OnlineUsersChart data={snapshotRows} />
        </div>
      </section>

      {/* Game mode plays */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Game mode plays</h2>
        <p className="text-slate-600 text-sm mb-2">How many times each mode has been played.</p>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2">Plays</th>
              </tr>
            </thead>
            <tbody>
              {gameModes.map((row) => (
                <tr key={row.mode_name} className="border-t">
                  <td className="px-4 py-2">{row.mode_name}</td>
                  <td className="px-4 py-2">{Number(row.play_count).toLocaleString()}</td>
                </tr>
              ))}
              {gameModes.length === 0 && (
                <tr className="border-t">
                  <td colSpan={2} className="px-4 py-4 text-slate-500">No data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Screen / page time */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Where people spend time (screen views)</h2>
        <p className="text-slate-600 text-sm mb-2">Event count per screen or path (screen_view events).</p>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2">Screen / path</th>
                <th className="px-4 py-2">Views</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((row) => (
                <tr key={row.screen_or_path} className="border-t">
                  <td className="px-4 py-2">{row.screen_or_path}</td>
                  <td className="px-4 py-2">{Number(row.event_count).toLocaleString()}</td>
                </tr>
              ))}
              {screens.length === 0 && (
                <tr className="border-t">
                  <td colSpan={2} className="px-4 py-4 text-slate-500">No screen_view events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* UK cities */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Connections by UK city</h2>
        <p className="text-slate-600 text-sm mb-2">Total profiles with country = GB, grouped by city (when set).</p>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2">Connections</th>
              </tr>
            </thead>
            <tbody>
              {ukCities.map((row) => (
                <tr key={row.city_name} className="border-t">
                  <td className="px-4 py-2">{row.city_name}</td>
                  <td className="px-4 py-2">{Number(row.connection_count).toLocaleString()}</td>
                </tr>
              ))}
              {ukCities.length === 0 && (
                <tr className="border-t">
                  <td colSpan={2} className="px-4 py-4 text-slate-500">No UK city data yet. Set city on profiles (e.g. from app) to see breakdown.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* By country */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Connections by country</h2>
        <p className="text-slate-600 text-sm mb-2">Total profiles per country.</p>
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Connections</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((row) => (
                <tr key={row.country_code} className="border-t">
                  <td className="px-4 py-2">{row.country_code}</td>
                  <td className="px-4 py-2">{Number(row.connection_count).toLocaleString()}</td>
                </tr>
              ))}
              {countries.length === 0 && (
                <tr className="border-t">
                  <td colSpan={2} className="px-4 py-4 text-slate-500">No country data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Link href="/" className="inline-block mt-4 text-slate-600 text-sm">Back to admin</Link>
    </div>
  );
}
