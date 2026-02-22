import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, Button } from '@trivora/ui';
import type { ChampionshipTournament } from '@trivora/core';

const TOURNAMENT_GLOBAL_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function TournamentsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: all } = await supabase
    .from('tournaments')
    .select('id, type, name, title, description, entry_fee_pence, prize_pence, registration_opens_at, games_begin_at, finals_at, finals_top_n, status, starts_at, ends_at')
    .order('starts_at', { ascending: false })
    .limit(20);
  const raw = (all ?? []) as (ChampionshipTournament & { starts_at?: string; ends_at?: string })[];
  const tournaments = raw.filter(
    (t) => t.type === 'global' || t.type === 'national' || ['published', 'live'].includes(t.status)
  );

  const global = tournaments.find((t) => t.id === TOURNAMENT_GLOBAL_ID || t.type === 'global');
  const nationals = tournaments.filter((t) => t.type === 'national');
  const others = tournaments.filter((t) => t.id !== global?.id && t.type !== 'national');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white pt-20">
      {/* Hero: The Trivora Global Quiz Rankings */}
      {global && (
        <section className="relative overflow-hidden border-b border-amber-500/30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent" />
          <div className="relative max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
            <p className="text-amber-400 font-semibold tracking-widest uppercase text-sm mb-2">
              Flagship Annual Championship
            </p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
              {global.name || global.title}
            </h1>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto mb-8">
              Qualify through elimination rounds. The Top 16 compete in the Live In-Person Finals. 
              One Global Champion takes home £1,000 and the trophy.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href={`/tournaments/${global.id}`}>
                <Button variant="primary" size="lg" className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-8 py-3 rounded-lg shadow-lg">
                  View details & register
                </Button>
              </Link>
              <Link href={`/tournaments/${global.id}#honours`}>
                <Button variant="ghost" size="lg" className="text-amber-400 border border-amber-500/50 hover:bg-amber-500/10">
                  Honours
                </Button>
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-amber-400">£{(global.prize_pence ?? 0) / 100}</p>
                <p className="text-slate-400 text-sm">Prize pool</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-400">£{(global.entry_fee_pence ?? 0) / 100}</p>
                <p className="text-slate-400 text-sm">Entry fee</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-400">{global.finals_top_n ?? 16}</p>
                <p className="text-slate-400 text-sm">Live finals</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-400">London</p>
                <p className="text-slate-400 text-sm">Year 1 finals</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="max-w-4xl mx-auto px-4 py-12">
        {nationals.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4 text-slate-200">National tournaments</h2>
            <p className="text-slate-400 mb-6">4 per year · Free entry · Same competitive structure.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {nationals.map((t) => (
                <Link key={t.id} href={`/tournaments/${t.id}`}>
                  <Card className="p-6 bg-slate-800/50 border-slate-700 hover:border-amber-500/50 transition cursor-pointer">
                    <h3 className="font-semibold text-lg">{t.name || t.title}</h3>
                    <p className="text-slate-400 text-sm mt-1">
                      Games: {formatDate(t.games_begin_at)} · Finals: {formatDate(t.finals_at)}
                    </p>
                    <Button variant="ghost" size="sm" className="mt-4 text-amber-400">View</Button>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 text-slate-200">Other events</h2>
            <ul className="space-y-4">
              {others.map((t) => (
                <Link key={t.id} href={`/tournaments/${t.id}`}>
                  <Card className="p-4 bg-slate-800/50 border-slate-700 hover:border-slate-600 transition cursor-pointer flex items-center justify-between">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-sm text-slate-500">
                        {t.starts_at ? formatDate(t.starts_at) : ''} – {t.ends_at ? formatDate(t.ends_at) : ''} · {t.status}
                      </p>
                    </div>
                    <span className="text-slate-400 text-sm">View</span>
                  </Card>
                </Link>
              ))}
            </ul>
          </section>
        )}

        {!global && tournaments.length === 0 && (
          <Card className="p-12 text-center bg-slate-800/50 border-slate-700">
            <p className="text-slate-400">No upcoming tournaments. Check back soon.</p>
          </Card>
        )}

        <div className="mt-12 pt-8 border-t border-slate-700">
          <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm">← Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
