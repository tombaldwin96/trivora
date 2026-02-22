/**
 * Live Quiz (new system): subscribe to live_quiz_state + leaderboard_snapshot,
 * fetch question pack once, submit answers via Edge Function.
 * Polls state periodically so app stays in sync if Realtime drops an update (e.g. on Next question).
 */
import { useEffect, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';

export type LiveQuizStateRow = {
  session_id: string;
  phase: string;
  countdown_ends_at: string | null;
  current_question_index: number;
  question_started_at: string | null;
  question_duration_ms: number;
  reveal_started_at: string | null;
  message: string | null;
  video_stream_url: string | null;
  siren_played_at: string | null;
  show_leaderboard_until: string | null;
  mahan_sweep_at: string | null;
  updated_at: string;
};

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  country: string | null;
  level?: number;
  total_score: number;
  correct_count: number;
  answered_count: number;
  /** Number of live quizzes this user has won (rank 1 when quiz ended). Used for stats only. */
  live_quiz_win_count?: number;
};

export type LiveQuizQuestion = {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  time_limit_ms: number;
  category: string | null;
};

const EDGE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1';

/** Call when user opens a session so they are added to the leaderboard and can play. */
export async function joinLiveQuizSession(sessionId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  try {
    await fetch(`${EDGE_URL}/join-live-quiz-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ session_id: sessionId }),
    });
  } catch {
    // ignore; user can still view; next answer submit will create score row
  }
}

export function useLiveQuizState(sessionId: string | null) {
  const [state, setState] = useState<LiveQuizStateRow | null>(null);
  const [snapshot, setSnapshot] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(!!sessionId);

  const fetchStateAndSnapshot = useCallback(async () => {
    if (!sessionId) return;
    const [stateRes, snapRes] = await Promise.all([
      supabase.from('live_quiz_state').select('*').eq('session_id', sessionId).single(),
      supabase.from('live_quiz_leaderboard_snapshot').select('top_json').eq('session_id', sessionId).single(),
    ]);
    setState((stateRes.data as LiveQuizStateRow) ?? null);
    const top = (snapRes.data as { top_json?: LeaderboardEntry[] } | null)?.top_json;
    setSnapshot(Array.isArray(top) ? top : []);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setState(null);
      setSnapshot([]);
      setLoading(false);
      return;
    }
    joinLiveQuizSession(sessionId);
    setLoading(true);
    fetchStateAndSnapshot().finally(() => setLoading(false));

    const channel = supabase
      .channel(`live-quiz-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quiz_state', filter: `session_id=eq.${sessionId}` }, (payload) => {
        setState(payload.new as LiveQuizStateRow);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quiz_leaderboard_snapshot', filter: `session_id=eq.${sessionId}` }, (payload) => {
        const row = payload.new as { top_json?: LeaderboardEntry[] };
        setSnapshot(Array.isArray(row?.top_json) ? row.top_json : []);
      })
      .subscribe();

    const pollInterval = setInterval(fetchStateAndSnapshot, 3000);

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') fetchStateAndSnapshot();
    });

    return () => {
      clearInterval(pollInterval);
      subscription.remove();
      supabase.removeChannel(channel);
    };
  }, [sessionId, fetchStateAndSnapshot]);

  return { state, leaderboard: snapshot, loading };
}

/** Build pack from DB (fallback when edge function is unavailable). */
async function fetchPackDirect(sessionId: string): Promise<LiveQuizQuestion[]> {
  const { data: rows } = await supabase
    .from('live_quiz_session_questions')
    .select('position, question_id, questions(id, prompt, answers_json, correct_index, explanation, time_limit_ms, category_id, categories(name))')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  return (rows ?? []).map((r: { position: number; question_id: string; questions: unknown }) => {
    const q = r.questions as {
      id: string;
      prompt: string;
      answers_json: unknown;
      correct_index: number;
      explanation: string | null;
      time_limit_ms: number;
      category_id: string;
      categories: { name: string } | null;
    } | null;
    if (!q) return null;
    const options = Array.isArray(q.answers_json) ? q.answers_json : [];
    const numOptions = Math.max(2, options.length);
    const rawCorrect = q.correct_index ?? 0;
    const correct_index = Math.max(0, Math.min(Number(rawCorrect), numOptions - 1));
    return {
      id: q.id,
      position: r.position,
      prompt: q.prompt,
      options,
      correct_index,
      explanation: q.explanation ?? null,
      time_limit_ms: q.time_limit_ms ?? 15000,
      category: q.categories?.name ?? null,
    };
  }).filter((x): x is LiveQuizQuestion => x != null);
}

async function loadPack(sessionId: string): Promise<LiveQuizQuestion[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];
  try {
    const res = await fetch(`${EDGE_URL}/get-live-quiz-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data?.questions)) return data.questions;
  } catch {
    // fallback below
  }
  try {
    return await fetchPackDirect(sessionId);
  } catch {
    return [];
  }
}

export function useLiveQuizPack(sessionId: string | null) {
  const [questions, setQuestions] = useState<LiveQuizQuestion[]>([]);
  const [loading, setLoading] = useState(!!sessionId);

  const refetchPack = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    const q = await loadPack(sessionId);
    setQuestions(q);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setQuestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadPack(sessionId).then((q) => {
      setQuestions(q);
      setLoading(false);
    });
  }, [sessionId]);

  return { questions, loading, refetchPack };
}

export async function submitLiveQuizAnswer(
  sessionId: string,
  questionId: string,
  answerIndex: number,
  elapsedMs: number,
  idempotencyKey?: string
): Promise<{ user_total_score: number; correct: boolean; score_awarded: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const res = await fetch(`${EDGE_URL}/submit-live-quiz-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: questionId,
      answer_index: Math.floor(Number(answerIndex)),
      elapsed_ms: Math.floor(Number(elapsedMs)),
      idempotency_key: idempotencyKey ?? undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as { user_total_score: number; correct: boolean; score_awarded: number };
}

export type PodiumEntry = {
  rank: number;
  user_id: string;
  username: string;
  live_quiz_win_count?: number;
  elapsed_ms: number;
  score_awarded: number;
};

export async function getLiveQuizQuestionPodium(
  sessionId: string,
  questionId: string
): Promise<{ entries: PodiumEntry[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { entries: [] };
  const res = await fetch(`${EDGE_URL}/get-live-quiz-question-podium`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ session_id: sessionId, question_id: questionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { entries: [] };
  return { entries: Array.isArray(data?.entries) ? data.entries : [] };
}
