'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';

type SessionRow = { id: string; title: string; status: string; scheduled_start_at: string | null; created_at: string };
type StateRow = {
  session_id: string;
  phase: string;
  countdown_ends_at: string | null;
  current_question_index: number;
  question_started_at: string | null;
  question_duration_ms: number;
  reveal_started_at: string | null;
  message: string | null;
  video_stream_url: string | null;
  show_leaderboard_until: string | null;
  mahan_sweep_at: string | null;
  updated_at: string;
};
type SnapshotRow = { session_id: string; top_json: unknown[]; updated_at: string };
type QuestionRow = { id: string; prompt: string; difficulty: number; category_id: string; correct_index?: number; answers_json?: unknown };
type QuestionBrowseRow = QuestionRow & { sub_category: string | null; language: string | null; appeal: number | null; categories?: { name: string } | null };
type CategoryRow = { id: string; name: string; slug: string };
type SessionQuestionRow = { id: string; session_id: string; question_id: string; position: number };
type ActionRow = { id: string; session_id: string; action_type: string; payload: unknown; created_at: string };
type PodiumEntry = { rank: number; user_id: string; username: string; elapsed_ms: number; score_awarded: number };
type LastQuestionAnswerEntry = { user_id: string; username: string | null; is_correct: boolean; elapsed_ms: number; score_awarded: number };

const EDGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1';

async function getSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function invokeAdmin(name: string, body: Record<string, unknown>) {
  const token = await getSession();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${EDGE_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error ?? res.statusText;
    throw new Error(
      msg === 'Failed to fetch'
        ? 'Request failed. Ensure Live Quiz edge functions are deployed (e.g. supabase functions deploy live-quiz-admin-start live-quiz-admin-next live-quiz-admin-reveal live-quiz-admin-end live-quiz-admin-countdown live-quiz-update-leaderboard-snapshot) and NEXT_PUBLIC_SUPABASE_URL is correct.'
        : msg
    );
  }
  return data;
}

export function LiveQuizControl({ initialSessions }: { initialSessions: SessionRow[] }) {
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<StateRow | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRow | null>(null);
  const [sessionQuestions, setSessionQuestions] = useState<SessionQuestionRow[]>([]);
  const [questionsPool, setQuestionsPool] = useState<QuestionRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'next' | 'reveal' | 'end' | null>(null);
  const [questionSearch, setQuestionSearch] = useState('');
  const [searchResults, setSearchResults] = useState<QuestionRow[]>([]);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ addedToSession: number; questionsCreated: number; skipped: number; totalRows: number } | null>(null);
  const [podiumEntries, setPodiumEntries] = useState<PodiumEntry[]>([]);
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [browseFilters, setBrowseFilters] = useState({
    difficulty: '' as number | '',
    category_id: '',
    sub_category: '',
    language: '',
    appeal: '' as number | '',
  });
  const [browseResults, setBrowseResults] = useState<QuestionBrowseRow[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [lastQuestionAnswers, setLastQuestionAnswers] = useState<{ correct: LastQuestionAnswerEntry[]; wrong: LastQuestionAnswerEntry[] } | null>(null);

  const refreshSessions = useCallback(async () => {
    const { data } = await supabase.from('live_quiz_sessions').select('id, title, status, scheduled_start_at, created_at').order('created_at', { ascending: false }).limit(50);
    if (data) setSessions(data as SessionRow[]);
  }, []);

  const deleteSession = useCallback(async () => {
    if (!selectedId) return;
    const session = sessions.find((s) => s.id === selectedId);
    const title = session ? `${session.title} (${session.status})` : 'this session';
    if (!window.confirm(`Delete ${title}? All session data (questions, answers, scores, state) will be permanently removed. This cannot be undone.`)) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.from('live_quiz_sessions').delete().eq('id', selectedId);
      if (err) throw new Error(err.message);
      setSelectedId(null);
      await refreshSessions();
      const { data: nextList } = await supabase.from('live_quiz_sessions').select('id').order('created_at', { ascending: false }).limit(1);
      if (Array.isArray(nextList) && nextList[0]) setSelectedId((nextList[0] as { id: string }).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session');
    }
    setLoading(false);
  }, [selectedId, sessions, refreshSessions]);

  useEffect(() => {
    if (!selectedId) {
      setState(null);
      setSnapshot(null);
      setSessionQuestions([]);
      setActions([]);
      return;
    }
    (async () => {
      const [stateRes, snapshotRes, sqRes, actionsRes] = await Promise.all([
        supabase.from('live_quiz_state').select('*').eq('session_id', selectedId).single(),
        supabase.from('live_quiz_leaderboard_snapshot').select('*').eq('session_id', selectedId).single(),
        supabase.from('live_quiz_session_questions').select('id, session_id, question_id, position').eq('session_id', selectedId).order('position'),
        supabase.from('live_quiz_admin_actions').select('id, session_id, action_type, payload, created_at').eq('session_id', selectedId).order('created_at', { ascending: false }).limit(30),
      ]);
      const s = stateRes.data as StateRow | null;
      setState(s ?? null);
      setSnapshot((snapshotRes.data as SnapshotRow | null) ?? null);
      setSessionQuestions((sqRes.data as SessionQuestionRow[]) ?? []);
      setActions((actionsRes.data as ActionRow[]) ?? []);
      setVideoUrl(s?.video_stream_url ?? '');
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const chan = supabase.channel(`live-quiz-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quiz_state', filter: `session_id=eq.${selectedId}` }, (payload) => {
        setState(payload.new as StateRow);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quiz_leaderboard_snapshot', filter: `session_id=eq.${selectedId}` }, (payload) => {
        setSnapshot(payload.new as SnapshotRow);
      })
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [selectedId]);

  const updateLeaderboardSnapshotDirect = useCallback(async (sessionId: string) => {
    const now = new Date().toISOString();
    const { data: kickedRows } = await supabase.from('live_quiz_kicked').select('user_id').eq('session_id', sessionId);
    const kickedIds = new Set(((kickedRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
    const { data: scoresRaw } = await supabase.from('live_quiz_scores').select('user_id, total_score, correct_count, answered_count').eq('session_id', sessionId).order('total_score', { ascending: false }).order('last_updated_at', { ascending: true }).limit(50);
    const topScores = (scoresRaw ?? []).filter((r: { user_id: string }) => !kickedIds.has(r.user_id)).slice(0, 25);
    const ids = topScores.map((r: { user_id: string }) => r.user_id);
    const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, username, avatar_url, country, level').in('id', ids) : { data: [] };
    const profileMap = Object.fromEntries(((profiles ?? []) as { id: string; username: string; avatar_url: string | null; country: string | null; level: number }[]).map((p) => [p.id, p]));
    const topJson = topScores.map((r: { user_id: string; total_score: number; correct_count: number; answered_count: number }, i: number) => ({ rank: i + 1, user_id: r.user_id, username: profileMap[r.user_id]?.username ?? null, avatar_url: profileMap[r.user_id]?.avatar_url ?? null, country: profileMap[r.user_id]?.country ?? null, level: profileMap[r.user_id]?.level ?? 1, total_score: r.total_score, correct_count: r.correct_count, answered_count: r.answered_count }));
    await supabase.from('live_quiz_leaderboard_snapshot').upsert({ session_id: sessionId, top_json: topJson, updated_at: now }, { onConflict: 'session_id' });
  }, []);

  useEffect(() => {
    if (!state || (state.phase !== 'open' && state.phase !== 'reveal') || !selectedId) return;
    const t = setInterval(async () => {
      try {
        await invokeAdmin('live-quiz-update-leaderboard-snapshot', { session_id: selectedId });
      } catch {
        try {
          await updateLeaderboardSnapshotDirect(selectedId);
        } catch {
          // ignore
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [selectedId, state?.phase, updateLeaderboardSnapshotDirect]);

  useEffect(() => {
    if (sessionQuestions.length === 0) return;
    const ids = [...new Set(sessionQuestions.map((q) => q.question_id))];
    supabase.from('questions').select('id, prompt, difficulty, category_id, correct_index, answers_json').in('id', ids).then(({ data }) => {
      setQuestionsPool((data as QuestionRow[]) ?? []);
    });
  }, [sessionQuestions]);

  const updateVideoUrl = async () => {
    if (!selectedId || !state) return;
    setLoading(true);
    setError(null);
    try {
      await supabase.from('live_quiz_state').update({ video_stream_url: videoUrl || null, updated_at: new Date().toISOString() }).eq('session_id', selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setLoading(false);
  };

  const createSession = async () => {
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not signed in. Refresh the page and log in again.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase.from('live_quiz_sessions').insert({ title: 'Live Quiz', status: 'draft', created_by: user.id }).select('id, title, status, scheduled_start_at, created_at').single();
      if (err) throw new Error(err.message);
      setSessions((prev) => [data as SessionRow, ...prev]);
      setSelectedId((data as SessionRow).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    }
    setLoading(false);
  };

  const runActionDirect = async (action: 'countdown' | 'start' | 'next' | 'reveal' | 'end', extra?: Record<string, unknown>) => {
    if (!selectedId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const now = new Date().toISOString();
    const minutes = (extra?.minutes as number) ?? 5;

    if (action === 'countdown') {
      const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await supabase.from('live_quiz_state').update({ phase: 'countdown', countdown_ends_at: endsAt, updated_at: now }).eq('session_id', selectedId);
      await supabase.from('live_quiz_sessions').update({ status: 'scheduled', updated_at: now }).eq('id', selectedId);
      await supabase.from('live_quiz_admin_actions').insert({ session_id: selectedId, admin_user_id: user.id, action_type: 'COUNTDOWN', payload: { minutes, countdown_ends_at: endsAt } });
    } else if (action === 'start') {
      await supabase.from('live_quiz_state').update({ phase: 'open', current_question_index: 0, question_started_at: now, countdown_ends_at: null, reveal_started_at: null, updated_at: now }).eq('session_id', selectedId);
      await supabase.from('live_quiz_sessions').update({ status: 'live', updated_at: now }).eq('id', selectedId);
      await supabase.from('live_quiz_admin_actions').insert({ session_id: selectedId, admin_user_id: user.id, action_type: 'START', payload: { current_question_index: 0 } });
    } else if (action === 'next') {
      const nextIndex = (state?.current_question_index ?? -1) + 1;
      await supabase.from('live_quiz_state').update({ phase: 'open', current_question_index: nextIndex, question_started_at: now, reveal_started_at: null, updated_at: now }).eq('session_id', selectedId);
      await supabase.from('live_quiz_admin_actions').insert({ session_id: selectedId, admin_user_id: user.id, action_type: 'NEXT', payload: { previous_index: state?.current_question_index ?? 0, new_index: nextIndex } });
    } else if (action === 'reveal') {
      await supabase.from('live_quiz_state').update({ phase: 'reveal', reveal_started_at: now, updated_at: now }).eq('session_id', selectedId);
      const { data: kickedRows } = await supabase.from('live_quiz_kicked').select('user_id').eq('session_id', selectedId);
      const kickedIds = new Set(((kickedRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
      const { data: scoresRaw } = await supabase.from('live_quiz_scores').select('user_id, total_score, correct_count, answered_count').eq('session_id', selectedId).order('total_score', { ascending: false }).order('last_updated_at', { ascending: true }).limit(50);
      const topScores = (scoresRaw ?? []).filter((r: { user_id: string }) => !kickedIds.has(r.user_id)).slice(0, 25);
      const ids = topScores.map((r: { user_id: string }) => r.user_id);
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, username, avatar_url, country, level').in('id', ids) : { data: [] };
      const profileMap = Object.fromEntries(((profiles ?? []) as { id: string; username: string; avatar_url: string | null; country: string | null; level: number }[]).map((p) => [p.id, p]));
      const topJson = topScores.map((r: { user_id: string; total_score: number; correct_count: number; answered_count: number }, i: number) => ({ rank: i + 1, user_id: r.user_id, username: profileMap[r.user_id]?.username ?? null, avatar_url: profileMap[r.user_id]?.avatar_url ?? null, country: profileMap[r.user_id]?.country ?? null, level: profileMap[r.user_id]?.level ?? 1, total_score: r.total_score, correct_count: r.correct_count, answered_count: r.answered_count }));
      await supabase.from('live_quiz_leaderboard_snapshot').upsert({ session_id: selectedId, top_json: topJson, updated_at: now }, { onConflict: 'session_id' });
      await supabase.from('live_quiz_admin_actions').insert({ session_id: selectedId, admin_user_id: user.id, action_type: 'REVEAL', payload: { reveal_started_at: now } });
    } else if (action === 'end') {
      const message = (extra?.message as string) ?? 'Thanks for playing!';
      await supabase.from('live_quiz_state').update({ phase: 'ended', message, updated_at: now }).eq('session_id', selectedId);
      const { data: kickedRows } = await supabase.from('live_quiz_kicked').select('user_id').eq('session_id', selectedId);
      const kickedIds = new Set(((kickedRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
      const { data: scoresRaw } = await supabase.from('live_quiz_scores').select('user_id, total_score, correct_count, answered_count').eq('session_id', selectedId).order('total_score', { ascending: false }).order('last_updated_at', { ascending: true }).limit(50);
      const topScores = (scoresRaw ?? []).filter((r: { user_id: string }) => !kickedIds.has(r.user_id)).slice(0, 25);
      const ids = topScores.map((r: { user_id: string }) => r.user_id);
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, username, avatar_url, country, level').in('id', ids) : { data: [] };
      const profileMap = Object.fromEntries(((profiles ?? []) as { id: string; username: string; avatar_url: string | null; country: string | null; level: number }[]).map((p) => [p.id, p]));
      const topJson = topScores.map((r: { user_id: string; total_score: number; correct_count: number; answered_count: number }, i: number) => ({ rank: i + 1, user_id: r.user_id, username: profileMap[r.user_id]?.username ?? null, avatar_url: profileMap[r.user_id]?.avatar_url ?? null, country: profileMap[r.user_id]?.country ?? null, level: profileMap[r.user_id]?.level ?? 1, total_score: r.total_score, correct_count: r.correct_count, answered_count: r.answered_count }));
      await supabase.from('live_quiz_leaderboard_snapshot').upsert({ session_id: selectedId, top_json: topJson, updated_at: now }, { onConflict: 'session_id' });
      await supabase.from('live_quiz_sessions').update({ status: 'ended', updated_at: now }).eq('id', selectedId);
      await supabase.from('live_quiz_admin_actions').insert({ session_id: selectedId, admin_user_id: user.id, action_type: 'END', payload: { message } });
      await supabase.rpc('record_live_quiz_winner', { p_session_id: selectedId }).catch(() => null);
    }
    const { data: actionsData } = await supabase.from('live_quiz_admin_actions').select('id, session_id, action_type, payload, created_at').eq('session_id', selectedId).order('created_at', { ascending: false }).limit(30);
    if (actionsData) setActions(actionsData as ActionRow[]);
  };

  const runAction = async (action: 'countdown' | 'start' | 'next' | 'reveal' | 'end', extra?: Record<string, unknown>) => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setConfirmAction(null);
    try {
      const name = action === 'countdown' ? 'live-quiz-admin-countdown' : action === 'start' ? 'live-quiz-admin-start' : action === 'next' ? 'live-quiz-admin-next' : action === 'reveal' ? 'live-quiz-admin-reveal' : 'live-quiz-admin-end';
      await invokeAdmin(name, { session_id: selectedId, ...extra });
      const [stateRes, actionsRes] = await Promise.all([
        supabase.from('live_quiz_state').select('*').eq('session_id', selectedId).single(),
        supabase.from('live_quiz_admin_actions').select('id, session_id, action_type, payload, created_at').eq('session_id', selectedId).order('created_at', { ascending: false }).limit(30),
      ]);
      if (stateRes.data) setState(stateRes.data as StateRow);
      if (actionsRes.data) setActions(actionsRes.data as ActionRow[]);
    } catch (e) {
      const isNetworkError = e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('Ensure Live Quiz edge functions'));
      const tryDirect = action === 'countdown' || action === 'start' || isNetworkError;
      if (tryDirect) {
        try {
          await runActionDirect(action, extra);
          setError(null);
          if (action === 'countdown' || action === 'start') {
            const stateRes = await supabase.from('live_quiz_state').select('*').eq('session_id', selectedId).single();
            if (stateRes.data) setState(stateRes.data as StateRow);
          }
        } catch (directErr) {
          setError(directErr instanceof Error ? directErr.message : 'Direct update failed');
        }
      } else {
        setError(e instanceof Error ? e.message : 'Failed');
      }
      const { data: actionsData } = await supabase.from('live_quiz_admin_actions').select('id, session_id, action_type, payload, created_at').eq('session_id', selectedId).order('created_at', { ascending: false }).limit(30);
      if (actionsData) setActions(actionsData as ActionRow[]);
    }
    setLoading(false);
  };

  const currentQuestion = state && sessionQuestions.length > 0
    ? sessionQuestions.find((sq) => sq.position === state.current_question_index)
    : null;
  const currentQuestionDetail = currentQuestion ? questionsPool.find((q) => q.id === currentQuestion.question_id) : null;

  const fetchPodium = useCallback(async () => {
    if (!selectedId || !currentQuestion?.question_id) return;
    const sessionId = selectedId;
    const questionId = currentQuestion.question_id;
    try {
      const data = await invokeAdmin('get-live-quiz-question-podium', {
        session_id: sessionId,
        question_id: questionId,
      });
      if (Array.isArray(data?.entries) && data.entries.length > 0) {
        setPodiumEntries(data.entries as PodiumEntry[]);
        return;
      }
    } catch {
      // fallback: fetch directly (admin can read live_quiz_answers)
    }
    try {
      const { data: answers } = await supabase
        .from('live_quiz_answers')
        .select('user_id, elapsed_ms, score_awarded')
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .eq('is_correct', true)
        .order('score_awarded', { ascending: false })
        .limit(3);
      const rows = (answers ?? []) as { user_id: string; elapsed_ms: number; score_awarded: number }[];
      if (rows.length === 0) {
        setPodiumEntries([]);
        return;
      }
      const ids = rows.map((r) => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', ids);
      const profileMap = Object.fromEntries(
        ((profiles ?? []) as { id: string; username: string | null }[]).map((p) => [p.id, p.username ?? '—'])
      );
      setPodiumEntries(rows.map((r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        username: profileMap[r.user_id] ?? '—',
        elapsed_ms: r.elapsed_ms,
        score_awarded: r.score_awarded,
      })));
    } catch {
      setPodiumEntries([]);
    }
  }, [selectedId, currentQuestion?.question_id]);

  useEffect(() => {
    if (!selectedId || !currentQuestion?.question_id || state?.phase !== 'reveal') {
      if (state?.phase !== 'reveal') setPodiumEntries([]);
      return;
    }
    fetchPodium();
  }, [selectedId, currentQuestion?.question_id, state?.phase, fetchPodium]);

  const lastQuestionIndex = state != null && sessionQuestions.length > 0
    ? (state.phase === 'reveal' || state.phase === 'locked' ? state.current_question_index : Math.max(0, state.current_question_index - 1))
    : -1;
  const lastQuestionId = lastQuestionIndex >= 0 ? sessionQuestions.find((sq) => sq.position === lastQuestionIndex)?.question_id : null;

  useEffect(() => {
    if (!selectedId || !lastQuestionId) {
      setLastQuestionAnswers(null);
      return;
    }
    (async () => {
      const { data: answers } = await supabase
        .from('live_quiz_answers')
        .select('user_id, is_correct, elapsed_ms, score_awarded')
        .eq('session_id', selectedId)
        .eq('question_id', lastQuestionId)
        .order('elapsed_ms', { ascending: true });
      if (!answers?.length) {
        setLastQuestionAnswers({ correct: [], wrong: [] });
        return;
      }
      const userIds = [...new Set((answers as { user_id: string }[]).map((a) => a.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from('profiles').select('id, username').in('id', userIds)
        : { data: [] };
      const profileMap = Object.fromEntries(
        ((profiles ?? []) as { id: string; username: string | null }[]).map((p) => [p.id, p.username ?? '—'])
      );
      const correct: LastQuestionAnswerEntry[] = [];
      const wrong: LastQuestionAnswerEntry[] = [];
      for (const a of answers as { user_id: string; is_correct: boolean; elapsed_ms: number; score_awarded: number }[]) {
        const entry = { user_id: a.user_id, username: profileMap[a.user_id] ?? null, is_correct: a.is_correct, elapsed_ms: a.elapsed_ms, score_awarded: a.score_awarded };
        if (a.is_correct) correct.push(entry);
        else wrong.push(entry);
      }
      setLastQuestionAnswers({ correct, wrong });
    })();
  }, [selectedId, lastQuestionId]);

  const searchQuestions = useCallback(async () => {
    const term = questionSearch.trim().slice(0, 100);
    if (!term) {
      const { data } = await supabase.from('questions').select('id, prompt, difficulty, category_id').eq('is_active', true).order('created_at', { ascending: false }).limit(50);
      setSearchResults((data as QuestionRow[]) ?? []);
      return;
    }
    const { data } = await supabase.from('questions').select('id, prompt, difficulty, category_id').eq('is_active', true).ilike('prompt', `%${term}%`).limit(30);
    setSearchResults((data as QuestionRow[]) ?? []);
  }, [questionSearch]);

  const fetchBrowseQuestions = useCallback(async () => {
    setBrowseLoading(true);
    try {
      let query = supabase
        .from('questions')
        .select('id, prompt, difficulty, category_id, sub_category, language, appeal, categories(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(100);
      if (browseFilters.difficulty !== '') {
        query = query.eq('difficulty', browseFilters.difficulty);
      }
      if (browseFilters.category_id) {
        query = query.eq('category_id', browseFilters.category_id);
      }
      if (browseFilters.sub_category.trim()) {
        query = query.ilike('sub_category', `%${browseFilters.sub_category.trim()}%`);
      }
      if (browseFilters.language.trim()) {
        query = query.ilike('language', `%${browseFilters.language.trim()}%`);
      }
      if (browseFilters.appeal !== '') {
        query = query.eq('appeal', browseFilters.appeal);
      }
      const { data } = await query;
      setBrowseResults((data as QuestionBrowseRow[]) ?? []);
    } catch {
      setBrowseResults([]);
    }
    setBrowseLoading(false);
  }, [browseFilters.difficulty, browseFilters.category_id, browseFilters.sub_category, browseFilters.language, browseFilters.appeal]);

  const openBrowseModal = useCallback(() => {
    setBrowseModalOpen(true);
    setBrowseFilters({ difficulty: '', category_id: '', sub_category: '', language: '', appeal: '' });
    supabase.from('categories').select('id, name, slug').eq('is_active', true).order('sort_order').order('name').then(({ data }) => {
      setCategories((data as CategoryRow[]) ?? []);
    });
    setBrowseResults([]);
  }, []);

  useEffect(() => {
    if (!browseModalOpen) return;
    fetchBrowseQuestions();
  }, [browseModalOpen, fetchBrowseQuestions]);

  const addQuestionToSession = async (questionId: string) => {
    if (!selectedId) return;
    setAddingQuestion(true);
    setError(null);
    try {
      const maxPos = sessionQuestions.length === 0 ? -1 : Math.max(...sessionQuestions.map((q) => q.position));
      const { error: err } = await supabase.from('live_quiz_session_questions').insert({ session_id: selectedId, question_id: questionId, position: maxPos + 1 });
      if (err) throw new Error(err.message);
      const { data } = await supabase.from('live_quiz_session_questions').select('id, session_id, question_id, position').eq('session_id', selectedId).order('position');
      setSessionQuestions((data as SessionQuestionRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
    setAddingQuestion(false);
  };

  const removeQuestionFromSession = async (sessionQuestionId: string) => {
    if (!selectedId) return;
    setError(null);
    try {
      await supabase.from('live_quiz_session_questions').delete().eq('id', sessionQuestionId);
      const { data } = await supabase.from('live_quiz_session_questions').select('id, session_id, question_id, position').eq('session_id', selectedId).order('position');
      setSessionQuestions((data as SessionQuestionRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const setQuestionCorrectIndex = async (questionId: string, correctIndex: number) => {
    setError(null);
    try {
      const { error: err } = await supabase.from('questions').update({ correct_index: correctIndex }).eq('id', questionId);
      if (err) throw new Error(err.message);
      setQuestionsPool((prev) => prev.map((q) => (q.id === questionId ? { ...q, correct_index: correctIndex } : q)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update correct index');
    }
  };

  const handleUploadQuestions = async () => {
    if (!selectedId || !uploadFile) {
      setError('Select a session and choose a CSV or XLSX file.');
      return;
    }
    setError(null);
    setUploadResult(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set('session_id', selectedId);
      formData.set('file', uploadFile);
      const res = await fetch('/api/live-quiz/upload-questions', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? res.statusText ?? 'Upload failed');
        setUploading(false);
        return;
      }
      setUploadResult(data);
      setUploadFile(null);
      const { data: sq } = await supabase.from('live_quiz_session_questions').select('id, session_id, question_id, position').eq('session_id', selectedId).order('position');
      setSessionQuestions((sq as SessionQuestionRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
    setUploading(false);
  };

  const topList = Array.isArray(snapshot?.top_json) ? snapshot.top_json : [];
  const countdownEndsAt = state?.countdown_ends_at ? new Date(state.countdown_ends_at).getTime() : null;

  const triggerMahanOnViewers = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const now = new Date().toISOString();
      const { error: err } = await supabase.from('live_quiz_state').update({ mahan_sweep_at: now, updated_at: now }).eq('session_id', selectedId);
      if (err) throw new Error(err.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trigger Mahan');
    }
  };

  const forceStandingsOnApp = async (show: boolean) => {
    if (!selectedId) return;
    setError(null);
    const show_leaderboard_until = show ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    setState((prev) => (prev ? { ...prev, show_leaderboard_until, updated_at: new Date().toISOString() } : null));
    try {
      const now = new Date().toISOString();
      const { error: err } = await supabase.from('live_quiz_state').update({ show_leaderboard_until, updated_at: now }).eq('session_id', selectedId);
      if (err) throw new Error(err.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
      setState((prev) => (prev ? { ...prev, show_leaderboard_until: state?.show_leaderboard_until ?? null, updated_at: state?.updated_at ?? '' } : null));
    }
  };

  const kickUser = async (userId: string) => {
    if (!selectedId) return;
    if (!window.confirm(`Remove this user from the session? They will be removed from the leaderboard and cannot submit more answers.`)) return;
    setError(null);
    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      if (!adminUser) throw new Error('Not signed in');
      const kickRes = await supabase.from('live_quiz_kicked').insert({ session_id: selectedId, user_id: userId, kicked_by: adminUser.id });
      if (kickRes.error && kickRes.error.code !== '23505') throw new Error(kickRes.error.message);
      await supabase.from('live_quiz_scores').delete().eq('session_id', selectedId).eq('user_id', userId);
      await updateLeaderboardSnapshotDirect(selectedId);
      const { data: snap } = await supabase.from('live_quiz_leaderboard_snapshot').select('top_json').eq('session_id', selectedId).single();
      if (snap) setSnapshot(snap as SnapshotRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to kick user');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Session selector */}
      <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Session</h2>
        <div className="flex gap-2 flex-wrap">
          <select
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white min-w-[200px]"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">Select session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title} ({s.status})</option>
            ))}
          </select>
          <button type="button" onClick={createSession} disabled={loading} className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-50">
            Create new
          </button>
          <button type="button" onClick={refreshSessions} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm">Refresh</button>
          {selectedId && (
            <button type="button" onClick={deleteSession} disabled={loading} className="rounded-lg bg-red-900/80 hover:bg-red-800 text-red-200 px-4 py-2 text-sm">
              Delete session
            </button>
          )}
        </div>
      </section>

      {/* Status */}
      {selectedId && (
        <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Status</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-sm font-medium ${state?.phase === 'open' ? 'bg-emerald-500/20 text-emerald-400' : state?.phase === 'reveal' ? 'bg-amber-500/20 text-amber-400' : state?.phase === 'ended' ? 'bg-slate-500/20 text-slate-400' : 'bg-slate-600/20 text-slate-300'}`}>
              {state?.phase ?? '—'}
            </span>
            <span className="text-slate-400 text-sm">Q#{state?.current_question_index ?? 0}</span>
            {countdownEndsAt != null && countdownEndsAt > Date.now() && (
              <span className="text-amber-400 text-sm">
                Countdown: {Math.ceil((countdownEndsAt - Date.now()) / 1000)}s
              </span>
            )}
          </div>
        </section>
      )}

      {error && <div className="lg:col-span-2 rounded-lg bg-red-500/20 text-red-300 px-4 py-2 text-sm">{error}</div>}

      {/* Video URL + Special Controls */}
      {selectedId && state && (
        <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Video stream (HLS URL)</h2>
          <div className="flex gap-2">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
            />
            <button type="button" onClick={updateVideoUrl} disabled={loading} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm disabled:opacity-50">Save</button>
          </div>

          {/* Special Controls */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Special Controls</h3>
            <p className="text-slate-400 text-xs mb-2">Countdown: set or override the current countdown. Leaderboard / Mahan affect viewers&apos; apps.</p>
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={() => runAction('countdown', { minutes: 5 })} disabled={loading} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm disabled:opacity-50">5 min</button>
              <button type="button" onClick={() => runAction('countdown', { minutes: 2 })} disabled={loading} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm disabled:opacity-50">2 min</button>
              <button type="button" onClick={() => runAction('countdown', { minutes: 0.5 })} disabled={loading} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm disabled:opacity-50">30 sec</button>
              <button type="button" onClick={() => runAction('start')} disabled={loading} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50">Start now</button>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-2 items-center">
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-slate-400 text-xs mr-1">Leaderboard:</span>
                <span className={`text-sm font-medium ${state?.show_leaderboard_until && new Date(state.show_leaderboard_until).getTime() > Date.now() ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {state?.show_leaderboard_until && new Date(state.show_leaderboard_until).getTime() > Date.now()
                    ? `ON until ${new Date(state.show_leaderboard_until).toLocaleTimeString(undefined, { timeStyle: 'short' })}`
                    : 'OFF'}
                </span>
              </div>
              <button type="button" onClick={() => forceStandingsOnApp(true)} disabled={!selectedId || loading} className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-50">Show standings</button>
              <button type="button" onClick={() => forceStandingsOnApp(false)} disabled={!selectedId || loading} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm font-medium disabled:opacity-50">Hide standings</button>
              <button type="button" onClick={triggerMahanOnViewers} disabled={!selectedId || loading} className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-medium disabled:opacity-50">Mahan</button>
              {state.phase !== 'ended' && (
                <>
                  <button type="button" onClick={() => setConfirmAction('end')} disabled={loading} className="rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-medium disabled:opacity-50">End quiz</button>
                  {confirmAction === 'end' && (
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => runAction('end')} className="rounded-lg bg-red-700 hover:bg-red-600 px-3 py-1 text-sm">Confirm</button>
                      <button type="button" onClick={() => setConfirmAction(null)} className="rounded-lg bg-slate-600 px-3 py-1 text-sm">Cancel</button>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Question control */}
      {selectedId && state && (
        <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Current question</h2>
          {currentQuestionDetail ? (
            <p className="text-slate-200 text-sm mb-2 truncate max-w-full" title={currentQuestionDetail.prompt}>{currentQuestionDetail.prompt}</p>
          ) : (
            <p className="text-slate-500 text-sm">No question at this index.</p>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            <button type="button" onClick={() => setConfirmAction('next')} disabled={loading || state.phase === 'ended'} className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-50">Next</button>
            <button type="button" onClick={() => setConfirmAction('reveal')} disabled={loading || state.phase === 'ended'} className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2 text-sm font-medium disabled:opacity-50">Reveal</button>
            {confirmAction === 'next' && (
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => runAction('next')} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-sm">Confirm</button>
                <button type="button" onClick={() => setConfirmAction(null)} className="rounded-lg bg-slate-600 px-3 py-1 text-sm">Cancel</button>
              </span>
            )}
            {confirmAction === 'reveal' && (
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => runAction('reveal')} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-sm">Confirm</button>
                <button type="button" onClick={() => setConfirmAction(null)} className="rounded-lg bg-slate-600 px-3 py-1 text-sm">Cancel</button>
              </span>
            )}
          </div>
          {/* Top 3 this question — fills in after you click Reveal */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top 3 this question</h3>
              {state.phase === 'reveal' && currentQuestion && (
                <button type="button" onClick={() => fetchPodium()} className="text-xs text-violet-400 hover:text-violet-300">Refresh</button>
              )}
            </div>
            {state.phase === 'reveal' && podiumEntries.length > 0 ? (
              <div className="space-y-1.5">
                {podiumEntries.map((e) => (
                  <div key={e.user_id} className="flex items-center gap-3 text-sm">
                    <span className="text-amber-400/90 font-medium w-6">#{e.rank}</span>
                    <span className="text-slate-200 flex-1 truncate">{e.username}</span>
                    <span className="text-slate-400 text-xs">{(e.elapsed_ms / 1000).toFixed(2)}s</span>
                    <span className="text-emerald-400 font-medium">+{e.score_awarded} pts</span>
                  </div>
                ))}
              </div>
            ) : state.phase === 'reveal' ? (
              <p className="text-slate-500 text-sm">No correct answers yet or loading… Click Refresh to try again.</p>
            ) : (
              <p className="text-slate-500 text-sm">Click Reveal to see who scored highest on this question (time + points).</p>
            )}
          </div>

          {/* Last question — who answered right / wrong */}
          {lastQuestionId && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Last question — who answered
              </h3>
              {lastQuestionAnswers ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-emerald-400/90 font-medium mb-1">Correct ({lastQuestionAnswers.correct.length})</p>
                    <ul className="space-y-0.5 text-slate-300">
                      {lastQuestionAnswers.correct.length === 0 ? (
                        <li className="text-slate-500">—</li>
                      ) : (
                        lastQuestionAnswers.correct.map((e) => (
                          <li key={e.user_id} className="flex items-center justify-between gap-2">
                            <span>{e.username ?? e.user_id.slice(0, 8)}</span>
                            <span className="text-emerald-400/80 text-xs">+{e.score_awarded} pts · {(e.elapsed_ms / 1000).toFixed(1)}s</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-red-400/90 font-medium mb-1">Wrong ({lastQuestionAnswers.wrong.length})</p>
                    <ul className="space-y-0.5 text-slate-300">
                      {lastQuestionAnswers.wrong.length === 0 ? (
                        <li className="text-slate-500">—</li>
                      ) : (
                        lastQuestionAnswers.wrong.map((e) => (
                          <li key={e.user_id}>{e.username ?? e.user_id.slice(0, 8)}</li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Loading…</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Leaderboard */}
      {selectedId && (
        <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Leaderboard (top 25)</h2>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {topList.slice(0, 25).map((entry: { rank?: number; user_id?: string; username?: string; total_score?: number; live_quiz_win_count?: number }, i) => (
              <div key={entry.user_id ?? i} className="flex justify-between items-center gap-2 text-sm py-1 border-b border-slate-700/50">
                <span className="text-slate-300">#{entry.rank ?? i + 1} {entry.username ?? '—'}</span>
                <span className="text-violet-300 font-medium">{entry.total_score ?? 0} pts</span>
                {entry.user_id && (
                  <button type="button" onClick={() => kickUser(entry.user_id!)} className="rounded bg-red-900/70 hover:bg-red-800 text-red-200 px-2 py-0.5 text-xs font-medium shrink-0">Kick</button>
                )}
              </div>
            ))}
            {topList.length === 0 && <p className="text-slate-500 text-sm">No scores yet.</p>}
          </div>
        </section>
      )}

      {/* Action log */}
      {selectedId && (
        <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Action log</h2>
          <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
            {actions.map((a) => (
              <div key={a.id} className="flex gap-2 text-slate-400">
                <span className="text-slate-500">{new Date(a.created_at).toLocaleTimeString()}</span>
                <span className="text-amber-400/90">{a.action_type}</span>
                {a.payload != null && <span className="truncate">{JSON.stringify(a.payload)}</span>}
              </div>
            ))}
            {actions.length === 0 && <p className="text-slate-500">No actions yet.</p>}
          </div>
        </section>
      )}

      {/* Question list builder */}
      {selectedId && (
        <section className="rounded-xl bg-slate-900/80 border border-slate-700 p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Session questions ({sessionQuestions.length})</h2>
            <button type="button" onClick={openBrowseModal} className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium">Browse & add questions</button>
          </div>

          {/* Upload CSV / XLSX (same format as Supabase import) */}
          <div className="mb-4 p-3 rounded-lg bg-slate-800/80 border border-slate-600">
            <p className="text-xs text-slate-400 mb-2">Upload CSV or XLSX: Category, Sub category, Question, Option 1 (correct), Option 2–4, Language, Difficulty (1–5), Appeal (1–5). First row = header.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setUploadFile(f ?? null);
                  setUploadResult(null);
                }}
                className="text-sm text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-white file:text-sm"
              />
              <button
                type="button"
                onClick={handleUploadQuestions}
                disabled={uploading || !uploadFile}
                className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload and add to session'}
              </button>
            </div>
            {uploadResult != null && (
              <p className="mt-2 text-sm text-emerald-400">
                Added {uploadResult.addedToSession} to session, {uploadResult.questionsCreated} new questions created, {uploadResult.skipped} skipped (of {uploadResult.totalRows ?? 0} rows).
              </p>
            )}
          </div>

          <div className="flex gap-2 mb-3 flex-wrap">
            <input
              type="text"
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchQuestions()}
              placeholder="Search prompt..."
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 min-w-[200px]"
            />
            <button type="button" onClick={searchQuestions} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm">Search</button>
          </div>
          {searchResults.length > 0 && (
            <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-slate-600 p-2 space-y-1">
              {searchResults.map((q) => (
                <div key={q.id} className="flex justify-between items-center text-sm">
                  <span className="text-slate-300 truncate flex-1 mr-2">{q.prompt.slice(0, 80)}{q.prompt.length > 80 ? '…' : ''}</span>
                  <button type="button" onClick={() => addQuestionToSession(q.id)} disabled={addingQuestion || sessionQuestions.some((sq) => sq.question_id === q.id)} className="rounded bg-violet-600 hover:bg-violet-500 px-2 py-1 text-xs disabled:opacity-50">Add</button>
                </div>
              ))}
            </div>
          )}
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
            {[...sessionQuestions].sort((a, b) => a.position - b.position).map((sq) => {
              const q = questionsPool.find((p) => p.id === sq.question_id);
              const optionsArray = Array.isArray(q?.answers_json) ? q.answers_json : [];
              const numOptions = Math.max(2, optionsArray.length);
              const rawCorrect = q?.correct_index ?? 0;
              const correctIndex = Math.max(0, Math.min(rawCorrect, numOptions - 1));
              return (
                <li key={sq.id} className="flex justify-between items-center gap-2 flex-wrap">
                  <span className="truncate flex-1 min-w-0">{q ? q.prompt.slice(0, 60) + (q.prompt.length > 60 ? '…' : '') : sq.question_id}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-slate-500" title="0=1st option, 1=2nd, …">Correct:</span>
                    <select value={correctIndex} onChange={(e) => setQuestionCorrectIndex(sq.question_id, Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white w-10" title={`0=1st … ${numOptions - 1}=${numOptions}th option (${numOptions} answers)`}>
                      {Array.from({ length: numOptions }, (_, i) => i).map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                    <button type="button" onClick={() => removeQuestionFromSession(sq.id)} className="rounded bg-red-900/50 hover:bg-red-800/50 px-2 py-1 text-xs text-red-300">Remove</button>
                  </span>
                </li>
              );
            })}
            {sessionQuestions.length === 0 && <li className="text-slate-500">None. Search and Add above.</li>}
          </ol>
        </section>
      )}

      {/* Browse questions modal */}
      {browseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setBrowseModalOpen(false)}>
          <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-200">Add questions to session</h3>
              <button type="button" onClick={() => setBrowseModalOpen(false)} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 border-b border-slate-700 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Difficulty</label>
                  <select value={browseFilters.difficulty === '' ? '' : browseFilters.difficulty} onChange={(e) => setBrowseFilters((f) => ({ ...f, difficulty: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Category</label>
                  <select value={browseFilters.category_id} onChange={(e) => setBrowseFilters((f) => ({ ...f, category_id: e.target.value }))} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="">Any</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Sub category</label>
                  <input type="text" value={browseFilters.sub_category} onChange={(e) => setBrowseFilters((f) => ({ ...f, sub_category: e.target.value }))} placeholder="Filter…" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Language</label>
                  <input type="text" value={browseFilters.language} onChange={(e) => setBrowseFilters((f) => ({ ...f, language: e.target.value }))} placeholder="Filter…" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Appeal</label>
                  <select value={browseFilters.appeal === '' ? '' : browseFilters.appeal} onChange={(e) => setBrowseFilters((f) => ({ ...f, appeal: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-white">
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <button type="button" onClick={fetchBrowseQuestions} disabled={browseLoading} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm disabled:opacity-50">Apply filters</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {browseLoading ? (
                <p className="text-slate-500 text-sm">Loading…</p>
              ) : browseResults.length === 0 ? (
                <p className="text-slate-500 text-sm">No questions match. Change filters and click Apply.</p>
              ) : (
                <ul className="space-y-2">
                  {browseResults.map((q) => {
                    const inSession = sessionQuestions.some((sq) => sq.question_id === q.id);
                    return (
                      <li key={q.id} className="flex items-start justify-between gap-2 py-2 border-b border-slate-700/50 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-slate-200 text-sm truncate" title={q.prompt}>{q.prompt}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Diff {q.difficulty}
                            {q.categories?.name ? ` · ${q.categories.name}` : ''}
                            {q.sub_category ? ` · ${q.sub_category}` : ''}
                            {q.language ? ` · ${q.language}` : ''}
                            {q.appeal != null ? ` · Appeal ${q.appeal}` : ''}
                          </p>
                        </div>
                        <button type="button" onClick={() => addQuestionToSession(q.id)} disabled={addingQuestion || inSession} className="rounded bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs font-medium shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">{inSession ? 'Added' : 'Add'}</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-slate-700">
              <button type="button" onClick={() => setBrowseModalOpen(false)} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
