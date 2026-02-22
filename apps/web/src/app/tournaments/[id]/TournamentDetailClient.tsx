'use client';

import { useState } from 'react';
import { Button } from '@trivora/ui';
import { supabase } from '@/lib/supabase/client';

type Props = {
  tournamentId: string;
  tournamentName: string;
  entryFeePence: number;
  isRegistered: boolean;
  paymentStatus: string | null;
  registrationOpensAt: string | null;
  status: string;
};

export function TournamentDetailClient({
  tournamentId,
  tournamentName,
  entryFeePence,
  isRegistered,
  paymentStatus,
  registrationOpensAt,
  status,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [registered, setRegistered] = useState(isRegistered);
  const [paid, setPaid] = useState(paymentStatus === 'paid');

  const now = new Date();
  const opensAt = registrationOpensAt ? new Date(registrationOpensAt) : null;
  const registrationOpen = opensAt ? now >= opensAt : status === 'registration_open' || status === 'in_progress' || status === 'finals';

  const handleRegister = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage('Please sign in to register.');
        setLoading(false);
        return;
      }
      const { error } = await (supabase as any).from('tournament_registrations').upsert(
        {
          tournament_id: tournamentId,
          user_id: user.id,
          payment_status: entryFeePence === 0 ? 'paid' : 'unpaid',
          payment_provider: entryFeePence === 0 ? 'none' : null,
        },
        { onConflict: 'tournament_id,user_id' }
      );
      if (error) {
        setMessage(error.message || 'Registration failed.');
        setLoading(false);
        return;
      }
      setRegistered(true);
      if (entryFeePence === 0) setPaid(true);
      else setMessage('Registration recorded. TODO: Complete payment (Stripe/in-app). For testing, an admin can set payment_status to paid.');
    } catch (e) {
      setMessage('Something went wrong.');
    }
    setLoading(false);
  };

  if (registered && paid) {
    return (
      <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-6">
        <p className="font-semibold text-emerald-400">You’re registered.</p>
        <p className="text-slate-400 text-sm mt-2">We’ll notify you when your first match is scheduled.</p>
        <a
          href={`/tournaments/${tournamentId}/calendar.ics`}
          download
          className="mt-4 inline-block rounded-xl px-3 py-1.5 text-sm font-semibold text-amber-400 bg-transparent hover:bg-slate-100 transition"
        >
          Add to calendar
        </a>
        <p className="text-slate-500 text-xs mt-2">TODO: Serve .ics for finals date.</p>
      </div>
    );
  }

  if (registered && !paid) {
    return (
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6">
        <p className="font-semibold text-amber-400">Registration pending payment</p>
        <p className="text-slate-400 text-sm mt-2">Entry fee £{entryFeePence / 100}. TODO: Stripe checkout or in-app purchase.</p>
        <p className="text-slate-500 text-xs mt-2">For testing: admin can set payment_status to paid in Supabase.</p>
      </div>
    );
  }

  if (!registrationOpen) {
    return (
      <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-6">
        <p className="text-slate-400">Registration opens on {registrationOpensAt ? new Date(registrationOpensAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6">
      <p className="text-slate-300 mb-4">
        {entryFeePence > 0
          ? `Entry fee: £${entryFeePence / 100}. You get a chance to win the prize, finalist awards, and an invitation to the Live Finals if you make the Top 16.`
          : 'Free entry. Register to compete.'}
      </p>
      {message && <p className="text-amber-400 text-sm mb-4">{message}</p>}
      <Button
        variant="primary"
        size="lg"
        className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold"
        onClick={handleRegister}
        disabled={loading}
      >
        {loading ? 'Registering…' : 'Register now'}
      </Button>
    </div>
  );
}
