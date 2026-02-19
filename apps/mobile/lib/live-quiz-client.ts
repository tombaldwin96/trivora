/**
 * Live quiz client helpers for high-concurrency, time-sensitive play.
 * - Answer submission: immediate send, single-flight per question (no double submit).
 * - Realtime: subscribe to live_sessions only (low frequency); never subscribe to live_answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { throttle } from '@/lib/debounce';

export type LiveSessionRow = {
  id: string;
  quiz_id: string;
  status: string;
  playback_url: string | null;
  started_at: string | null;
  ended_at: string | null;
};

/** Minimum throttle for applying live session state updates (keeps video smooth). */
export const LIVE_STATE_THROTTLE_MS = 300;

/**
 * Submit a live answer. Time-sensitive: sends immediately.
 * Single-flight per question: ignores duplicate calls for the same question until the first resolves.
 */
export function useSubmitLiveAnswer() {
  const inFlightByQuestion = useRef<Set<string>>(new Set());

  return useCallback(
    async (
      sessionId: string,
      questionId: string,
      answerIndex: number,
      timeMs: number,
      isCorrect: boolean,
      score: number
    ): Promise<{ ok: boolean; error?: string }> => {
      const key = `${sessionId}:${questionId}`;
      if (inFlightByQuestion.current.has(key)) {
        return { ok: false, error: 'Already submitted' };
      }
      inFlightByQuestion.current.add(key);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        inFlightByQuestion.current.delete(key);
        return { ok: false, error: 'Not signed in' };
      }

      const { error } = await supabase.from('live_answers').insert({
        session_id: sessionId,
        question_id: questionId,
        user_id: user.id,
        answer_index: answerIndex,
        time_ms: timeMs,
        is_correct: isCorrect,
        score,
      });

      inFlightByQuestion.current.delete(key);

      if (error) {
        if (error.code === '23505') return { ok: true }; // unique violation = already answered
        return { ok: false, error: error.message };
      }
      return { ok: true };
    },
    []
  );
}

/**
 * Subscribe to live_sessions changes for one session with throttled state updates
 * so the UI (and video) doesn't get hammered by rapid updates.
 */
export function useThrottledLiveSession(sessionId: string | null) {
  const [session, setSession] = useState<LiveSessionRow | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return undefined;
    }

    const apply = throttle((payload: LiveSessionRow) => {
      if (mountedRef.current) setSession(payload);
    }, LIVE_STATE_THROTTLE_MS);

    const fetchOnce = async () => {
      const { data } = await supabase
        .from('live_sessions')
        .select('id, quiz_id, status, playback_url, started_at, ended_at')
        .eq('id', sessionId)
        .single();
      if (data && mountedRef.current) setSession(data as LiveSessionRow);
    };

    fetchOnce();

    const channel = supabase
      .channel(`live_session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row)
            apply({
              id: row.id as string,
              quiz_id: row.quiz_id as string,
              status: row.status as string,
              playback_url: (row.playback_url as string) ?? null,
              started_at: (row.started_at as string) ?? null,
              ended_at: (row.ended_at as string) ?? null,
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return session;
}
