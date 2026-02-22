'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Card, Button } from '@trivora/ui';

type Match = {
  id: string;
  status: string;
  player_a: string;
  player_b: string;
  points_a: number;
  points_b: number;
  result: unknown;
};

export function MatchClient() {
  const params = useParams();
  const id = params.id as string;
  const [match, setMatch] = useState<Match | null>(null);
  const [profiles, setProfiles] = useState<Record<string, { username: string; display_name?: string; live_quiz_win_count?: number }>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!id) return;
    supabase.from('matches_1v1').select('*').eq('id', id).single().then(({ data }) => setMatch(data ?? null));
  }, [id]);

  useEffect(() => {
    if (!match?.player_a || !match?.player_b) return;
    supabase.from('profiles').select('id, username, display_name, live_quiz_win_count').in('id', [match.player_a, match.player_b]).then(({ data }) => {
      const map: Record<string, { username: string; display_name?: string; live_quiz_win_count?: number }> = {};
      ((data ?? []) as { id: string; username: string; display_name?: string; live_quiz_win_count?: number }[]).forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    });
  }, [match?.player_a, match?.player_b]);

  if (!match) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <p className="text-slate-500">Loading match…</p>
      </div>
    );
  }

  const isPlayerA = userId === match.player_a;
  const isPlayerB = userId === match.player_b;
  const myScore = isPlayerA ? match.points_a : isPlayerB ? match.points_b : 0;
  const oppScore = isPlayerA ? match.points_b : match.points_a;

  return (
    <div className="max-w-lg mx-auto py-6">
      <h1 className="text-xl font-bold mb-4">1v1 Match</h1>
      <Card className="p-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium">
              {profiles[match.player_a]?.display_name || profiles[match.player_a]?.username || 'Player A'}
            </p>
            <p className="text-2xl font-bold text-brand-600">{match.points_a}</p>
          </div>
          <span className="text-slate-400">vs</span>
          <div className="text-right">
            <p className="font-medium">
              {profiles[match.player_b]?.display_name || profiles[match.player_b]?.username || 'Player B'}
            </p>
            <p className="text-2xl font-bold text-brand-600">{match.points_b}</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-4">Status: {match.status}</p>
        {match.status === 'pending' && (isPlayerA || isPlayerB) && (
          <p className="text-sm mt-2">Match is ready. Play rounds via API or in-app flow (scaffold).</p>
        )}
        {match.status === 'completed' && (
          <p className="mt-4 font-medium">Match complete. Check standings on your profile.</p>
        )}
      </Card>
      <Link href="/modes/1v1"><Button variant="ghost" className="w-full mt-4">Back to 1v1</Button></Link>
    </div>
  );
}
