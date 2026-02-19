import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { scoreSingleAnswer } from '@mahan/core';
import { debounce } from '@/lib/debounce';

const ROUNDS_COUNT = 5;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
/** 1v1 is turn-based: realtime only needs to be "close", not instant. Debounce avoids overload. */
const REALTIME_DEBOUNCE_MS = 1000;

type Match = {
  id: string;
  status: string;
  player_a: string;
  player_b: string;
  points_a: number;
  points_b: number;
  result?: { winner_id: string | null; score_a: number; score_b: number };
};

type Round = {
  id: string;
  match_id: string;
  question_id: string;
  a_answer: number | null;
  b_answer: number | null;
  a_time_ms: number | null;
  b_time_ms: number | null;
  a_correct: boolean | null;
  b_correct: boolean | null;
};

type Question = {
  id: string;
  prompt: string;
  answers_json: string[];
  correct_index: number;
  time_limit_ms: number;
};

export default function MatchScreen() {
  const { id: matchId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [match, setMatch] = useState<Match | null>(null);
  const [rounds, setRounds] = useState<(Round & { question?: Question })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const questionStartTimeRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const finalizeCalledRef = useRef(false);
  const mountedRef = useRef(true);

  const userId = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/');
      return;
    }
    userId.current = user.id;

    const { data: matchData, error: matchErr } = await supabase
      .from('matches_1v1')
      .select('id, status, player_a, player_b, points_a, points_b, result')
      .eq('id', matchId)
      .single();

    if (matchErr || !matchData) {
      if (mountedRef.current) {
        Alert.alert('Error', 'Match not found');
        router.back();
      }
      return;
    }
    if (mountedRef.current) setMatch(matchData as Match);

    if (matchData.status === 'pending') {
      const { data: roundRows } = await supabase.from('match_rounds').select('id').eq('match_id', matchId);
      if (!roundRows || roundRows.length === 0) {
        const { data: qRows } = await supabase
          .from('questions')
          .select('id')
          .eq('is_active', true);
        const ids = (qRows ?? []).map((r) => r.id);
        const shuffled = [...ids].sort(() => Math.random() - 0.5).slice(0, ROUNDS_COUNT);
        for (const qid of shuffled) {
          await supabase.from('match_rounds').insert({ match_id: matchId, question_id: qid });
        }
        await supabase
          .from('matches_1v1')
          .update({ status: 'in_progress', started_at: new Date().toISOString() })
          .eq('id', matchId);
      }
    }

    const { data: roundData } = await supabase
      .from('match_rounds')
      .select('id, match_id, question_id, a_answer, b_answer, a_time_ms, b_time_ms, a_correct, b_correct')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (!roundData?.length) {
      if (mountedRef.current) {
        setLoading(false);
        setRounds([]);
      }
      return;
    }

    const qIds = [...new Set(roundData.map((r) => r.question_id))];
    const { data: questionData } = await supabase
      .from('questions')
      .select('id, prompt, answers_json, correct_index, time_limit_ms')
      .in('id', qIds);

    const qMap = new Map((questionData ?? []).map((q) => [q.id, q as Question]));
    const roundsWithQ = roundData.map((r) => ({
      ...r,
      question: qMap.get(r.question_id),
    })) as (Round & { question?: Question })[];
    if (mountedRef.current) {
      setRounds(roundsWithQ);
      setLoading(false);
    }
  }, [matchId, router]);

  const loadMatchRef = useRef(loadMatch);
  loadMatchRef.current = loadMatch;
  const debouncedRealtimeRefreshRef = useRef(
    debounce(() => {
      loadMatchRef.current?.();
    }, REALTIME_DEBOUNCE_MS)
  );

  const currentRoundIndexForEffect = match?.status === 'in_progress' && rounds.length
    ? rounds.findIndex((r) => (match.player_a === userId.current ? r.a_answer == null : r.b_answer == null))
    : -1;
  useEffect(() => {
    if (currentRoundIndexForEffect >= 0) questionStartTimeRef.current = Date.now();
  }, [currentRoundIndexForEffect]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  useEffect(() => {
    if (!matchId || !match) return;
    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_rounds',
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          debouncedRealtimeRefreshRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches_1v1',
          filter: `id=eq.${matchId}`,
        },
        () => {
          debouncedRealtimeRefreshRef.current();
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId, match?.status, loadMatch]);

  const submitAnswer = async (roundIndex: number, answerIndex: number) => {
    if (!match || !matchId || submitting) return;
    const round = rounds[roundIndex];
    if (!round?.question) return;
    const amA = match.player_a === userId.current;
    if (amA && round.a_answer != null) return;
    if (!amA && round.b_answer != null) return;

    setSubmitting(true);
    const start = questionStartTimeRef.current || Date.now();
    const timeMs = Math.max(300, Date.now() - start);
    const correct = round.question.correct_index === answerIndex;
    const timeLimitMs = round.question.time_limit_ms ?? 15000;
    const points = scoreSingleAnswer(correct, timeMs, timeLimitMs);

    const updates: Partial<Round> = amA
      ? { a_answer: answerIndex, a_time_ms: timeMs, a_correct: correct }
      : { b_answer: answerIndex, b_time_ms: timeMs, b_correct: correct };

    await supabase.from('match_rounds').update(updates).eq('id', round.id);

    const { data: m } = await supabase.from('matches_1v1').select('points_a, points_b').eq('id', matchId).single();
    const newA = amA ? (m?.points_a ?? 0) + points : (m?.points_a ?? 0);
    const newB = amA ? (m?.points_b ?? 0) : (m?.points_b ?? 0) + points;
    await supabase.from('matches_1v1').update(amA ? { points_a: newA } : { points_b: newB }).eq('id', matchId);

    await loadMatch();
    setSubmitting(false);
  };

  useEffect(() => {
    if (match?.status !== 'in_progress' || !rounds.length || finalizeCalledRef.current) return;
    const bothAnsweredCount = rounds.filter((r) => r.a_answer != null && r.b_answer != null).length;
    if (bothAnsweredCount < rounds.length) return;
    finalizeCalledRef.current = true;
    supabase.auth.getSession().then(({ data: { session } }) =>
      fetch(`${SUPABASE_URL}/functions/v1/finalize-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ match_id: matchId }),
      }).then(() => loadMatch())
    );
  }, [match?.status, rounds, matchId, loadMatch]);

  if (loading || !match) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#5b21b6" />
      </View>
    );
  }

  if (match.status === 'completed') {
    const amA = match.player_a === userId.current;
    const myScore = amA ? match.points_a : match.points_b;
    const oppScore = amA ? match.points_b : match.points_a;
    const winnerId = match.result?.winner_id ?? null;
    const won = winnerId === userId.current;
    const drew = winnerId === null;

    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
        <Text style={styles.resultTitle}>Match complete</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>You</Text>
          <Text style={styles.scoreValue}>{myScore}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Opponent</Text>
          <Text style={styles.scoreValue}>{oppScore}</Text>
        </View>
        <Text style={styles.outcome}>{won ? 'You win!' : drew ? 'Draw' : 'You lose'}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const amA = match.player_a === userId.current;
  const currentRoundIndex = rounds.findIndex((r) => (amA ? r.a_answer == null : r.b_answer == null));
  const currentRound = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
  const waitingForOpponent = currentRoundIndex < 0 && match.status === 'in_progress';

  if (waitingForOpponent) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.waitingText}>Waiting for opponent…</Text>
        <ActivityIndicator size="large" color="#5b21b6" style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!currentRound?.question) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.waitingText}>Loading…</Text>
      </View>
    );
  }

  const answers = Array.isArray(currentRound.question.answers_json)
    ? currentRound.question.answers_json
    : [];
  const prompt = currentRound.question.prompt ?? '';
  const timeLimitMs = currentRound.question.time_limit_ms ?? 15000;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      <Text style={styles.progress}>
        Question {currentRoundIndex + 1} of {rounds.length}
      </Text>
      <Text style={styles.prompt}>{prompt}</Text>
      <View style={styles.answers}>
        {answers.map((text, idx) => (
          <Pressable
            key={idx}
            style={[styles.answerBtn, submitting && styles.answerDisabled]}
            onPress={() => {
              if (!questionStartTimeRef.current) questionStartTimeRef.current = Date.now();
              submitAnswer(currentRoundIndex, idx);
            }}
            disabled={submitting}
          >
            <Text style={styles.answerText}>{text}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.scoreLine}>
        You: {amA ? match.points_a : match.points_b} · Opponent: {amA ? match.points_b : match.points_a}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingHorizontal: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  progress: { fontSize: 14, color: '#64748b', marginBottom: 12 },
  prompt: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 24 },
  answers: { gap: 12, marginBottom: 24 },
  answerBtn: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
  },
  answerDisabled: { opacity: 0.7 },
  answerText: { fontSize: 16, color: '#334155' },
  scoreLine: { fontSize: 14, color: '#64748b' },
  resultTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b', marginBottom: 24, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  scoreLabel: { fontSize: 16, color: '#64748b' },
  scoreValue: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  outcome: { fontSize: 20, fontWeight: '700', color: '#5b21b6', marginTop: 16, textAlign: 'center' },
  backBtn: { marginTop: 32, backgroundColor: '#5b21b6', padding: 16, borderRadius: 12, alignItems: 'center' },
  backBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  waitingText: { fontSize: 16, color: '#64748b' },
});
