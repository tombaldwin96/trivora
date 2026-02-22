import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, Button } from '@trivora/ui';
import { TournamentDetailClient } from './TournamentDetailClient';
import type { ChampionshipTournament } from '@trivora/core';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !data) notFound();

  const t = data as ChampionshipTournament & { starts_at?: string; ends_at?: string };
  const isGlobal = t.type === 'global';
  const hasEntryFee = (t.entry_fee_pence ?? 0) > 0;

  const { data: { user } } = await supabase.auth.getUser();
  let myRegistration: { payment_status: string } | null = null;
  if (user) {
    const { data: reg } = await supabase
      .from('tournament_registrations')
      .select('payment_status')
      .eq('tournament_id', t.id)
      .eq('user_id', user.id)
      .maybeSingle();
    myRegistration = reg as { payment_status: string } | null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Hero */}
      <section className="relative border-b border-amber-500/30">
        <div className="absolute inset-0 bg-amber-900/10" />
        <div className="relative max-w-4xl mx-auto px-4 py-12 sm:py-16">
          <p className="text-amber-400 font-semibold tracking-widest uppercase text-sm mb-2">
            {isGlobal ? 'Global Championship' : 'National Tournament'}
          </p>
          <h1 className="text-3xl sm:text-4xl font-black mb-4">{t.name || t.title}</h1>
          {t.description && (
            <p className="text-slate-300 text-lg max-w-2xl">{t.description}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-4">
            {hasEntryFee && (
              <span className="inline-flex items-center rounded-full bg-amber-500/20 px-4 py-2 text-amber-400 font-semibold">
                Entry £{(t.entry_fee_pence ?? 0) / 100}
              </span>
            )}
            {!hasEntryFee && t.type === 'national' && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-4 py-2 text-emerald-400 font-semibold">
                Free entry
              </span>
            )}
            {(t.prize_pence ?? 0) > 0 && (
              <span className="inline-flex items-center rounded-full bg-slate-700 px-4 py-2 text-slate-200 font-semibold">
                Prize £{(t.prize_pence ?? 0) / 100}
              </span>
            )}
            {t.finals_top_n && (
              <span className="inline-flex items-center rounded-full bg-slate-700 px-4 py-2 text-slate-200 font-semibold">
                Top {t.finals_top_n} → Live Finals
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-14">
        {/* Timeline */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-amber-400">Event timeline</h2>
          <Card className="p-6 bg-slate-800/50 border-slate-700">
            <ul className="space-y-4">
              <li className="flex justify-between items-start border-b border-slate-700 pb-3">
                <span className="text-slate-400">Registration opens</span>
                <span className="font-semibold">{formatDate(t.registration_opens_at)}</span>
              </li>
              <li className="flex justify-between items-start border-b border-slate-700 pb-3">
                <span className="text-slate-400">Games begin</span>
                <span className="font-semibold">{formatDate(t.games_begin_at)}</span>
              </li>
              <li className="flex justify-between items-start border-b border-slate-700 pb-3">
                <span className="text-slate-400">Live Finals</span>
                <span className="font-semibold">{formatDate(t.finals_at)} · {t.location_city || 'TBC'}</span>
              </li>
              {t.finals_time_window && (
                <li className="flex justify-between items-start border-b border-slate-700 pb-3">
                  <span className="text-slate-400">Finals window</span>
                  <span className="font-semibold">{t.finals_time_window}</span>
                </li>
              )}
              <li className="flex justify-between items-start">
                <span className="text-slate-400">Awards ceremony</span>
                <span className="font-semibold">{formatDate(t.awards_at)} · {t.awards_at ? formatTime(t.awards_at) : ''}</span>
              </li>
            </ul>
          </Card>
        </section>

        {/* Format */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-amber-400">Format</h2>
          <Card className="p-6 bg-slate-800/50 border-slate-700 prose prose-invert max-w-none">
            <p className="text-slate-300">
              Qualifiers run as elimination rounds (Round of 256 → 128 → 64 → 32 → 16). 
              Each round is a timed quiz; winners advance. The last 16 players qualify for the{' '}
              <strong>Live In-Person Finals</strong>, streamed live. At the finals, all 16 compete in person; 
              the winner is crowned Global Champion and receives £1,000, a trophy, and a certificate. 
              All 16 finalists receive an award; the awards ceremony is held the same day with a special guest.
            </p>
          </Card>
        </section>

        {/* Register */}
        <section id="register">
          <h2 className="text-2xl font-bold mb-6 text-amber-400">Register</h2>
          <TournamentDetailClient
            tournamentId={t.id}
            tournamentName={t.name || t.title}
            entryFeePence={t.entry_fee_pence ?? 0}
            isRegistered={!!myRegistration}
            paymentStatus={myRegistration?.payment_status ?? null}
            registrationOpensAt={t.registration_opens_at}
            status={t.status}
          />
        </section>

        {/* Rules / Eligibility */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-amber-400">Rules & eligibility</h2>
          <Card className="p-6 bg-slate-800/50 border-slate-700">
            <ul className="list-disc list-inside space-y-2 text-slate-300">
              <li>One account per person; no multi-accounting.</li>
              <li>Fair play and anti-cheat apply; violations result in disqualification.</li>
              <li>Eligibility may vary by region; see full Terms for details.</li>
              <li>Refunds: see tournament Terms (typically before games begin).</li>
            </ul>
            <p className="mt-4 text-slate-400 text-sm">
              <Link href="/terms" className="text-amber-400 hover:underline">Full Terms & conditions</Link>
            </p>
          </Card>
        </section>

        {/* Live Finals experience */}
        <section>
          <h2 className="text-2xl font-bold mb-6 text-amber-400">Live Finals experience</h2>
          <Card className="p-6 bg-slate-800/50 border-slate-700">
            <p className="text-slate-300 mb-4">
              Year 1 finals are in <strong>London</strong>. The venue will be announced closer to the date. 
              The event is streamed live; finalists compete in person. Dress code: smart (suits encouraged). 
              The awards ceremony takes place the same evening with a special guest. 
              The Global Champion receives a trophy and certificate.
            </p>
            <p className="text-slate-400 text-sm">
              TODO: Venue details and check-in (QR) will be sent to qualified players.
            </p>
          </Card>
        </section>

        {/* Honours */}
        <section id="honours">
          <h2 className="text-2xl font-bold mb-6 text-amber-400">Honours</h2>
          <Card className="p-8 bg-slate-800/50 border-slate-700 text-center">
            <p className="text-slate-400">Winners and past champions will appear here after the event.</p>
            <p className="text-slate-500 text-sm mt-2">Placeholder — admin can populate tournament_honours.</p>
          </Card>
        </section>

        {/* FAQ */}
        <section id="faq">
          <h2 className="text-2xl font-bold mb-6 text-amber-400">FAQ</h2>
          <Card className="p-6 bg-slate-800/50 border-slate-700 space-y-6">
            <div>
              <h3 className="font-semibold text-slate-200">How do I register?</h3>
              <p className="text-slate-400 text-sm mt-1">Sign in, open this page, and click Register. Pay the entry fee (Global £5; National is free). You’ll receive a confirmation.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">How do the rounds work?</h3>
              <p className="text-slate-400 text-sm mt-1">Each round you’re matched against an opponent; you both answer the same questions. The higher score advances. This continues until the Top 16 remain.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">What if I miss a match?</h3>
              <p className="text-slate-400 text-sm mt-1">Matches have a scheduled window. If you don’t play in time, you may forfeit. Check the tournament schedule and your match times.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">Refunds?</h3>
              <p className="text-slate-400 text-sm mt-1">See the full Terms. Typically refunds are available before games begin if you cannot participate.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">Travel to the finals?</h3>
              <p className="text-slate-400 text-sm mt-1">Qualified players are responsible for their own travel and accommodation. Venue and check-in details will be shared with finalists.</p>
            </div>
          </Card>
        </section>

        <div className="pt-8 border-t border-slate-700">
          <Link href="/tournaments" className="text-slate-400 hover:text-white text-sm">← All tournaments</Link>
        </div>
      </div>
    </div>
  );
}
