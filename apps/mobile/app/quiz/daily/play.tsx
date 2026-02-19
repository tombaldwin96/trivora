import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { scoreSingleAnswer, clampReactionTime } from '@mahan/core';

type Question = { id: string; prompt: string; answers_json: string[]; correct_index: number; time_limit_ms: number };

export default function DailyQuizPlayScreen() {
  const { quiz_id, attempt_id } = useLocalSearchParams<{ quiz_id: string; attempt_id?: string }>();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(attempt_id ?? null);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadQuiz = useCallback(async () => {
    if (!quiz_id) return;
    const { data: qq } = await supabase.from('quiz_questions').select('question_id, order_index').eq('quiz_id', quiz_id).order('order_index');
    if (!qq?.length) {
      setLoading(false);
      return;
    }
    const ids = qq.map((r) => r.question_id);
    const { data: qs } = await supabase.from('questions').select('id, prompt, answers_json, correct_index, time_limit_ms').in('id', ids);
    const orderMap = Object.fromEntries(qq.map((r) => [r.question_id, r.order_index]));
    const sorted = (qs ?? []).sort((a, b) => (orderMap[a.id] ?? 0) - (orderMap[b.id] ?? 0)) as Question[];
    setQuestions(sorted);
    if (!attempt_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: attempt } = await supabase.from('attempts').insert({ user_id: user.id, quiz_id, mode: 'daily', score_total: 0 }).select('id').single();
      if (attempt) setAttemptId(attempt.id);
    }
    setLoading(false);
  }, [quiz_id, attempt_id]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const question = questions[index];
  const answers = question ? (Array.isArray(question.answers_json) ? question.answers_json : []) : [];

  const handleAnswer = async (answerIndex: number) => {
    if (!question || !attemptId || submitting) return;
    setSubmitting(true);
    const endAt = Date.now();
    const timeMs = startedAt != null ? clampReactionTime(endAt - startedAt) : 0;
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${url}/functions/v1/submit-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ attempt_id: attemptId, question_id: question.id, answer_index: answerIndex, time_ms: timeMs }),
    });
    if (index + 1 >= questions.length) {
      await supabase.from('attempts').update({ ended_at: new Date().toISOString() }).eq('id', attemptId);
      router.replace({ pathname: '/quiz/daily/result', params: { attempt_id: attemptId } });
      return;
    }
    setIndex((i) => i + 1);
    setStartedAt(null);
    setSubmitting(false);
  };

  useEffect(() => {
    if (question && startedAt === null) setStartedAt(Date.now());
  }, [question?.id, startedAt]);

  if (loading || !quiz_id) return <View style={styles.centered}><Text style={styles.sub}>Loading…</Text></View>;
  if (!questions.length) return <View style={styles.centered}><Text style={styles.sub}>No questions.</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.progress}>Question {index + 1} of {questions.length}</Text>
      <View style={styles.card}>
        <Text style={styles.prompt}>{question.prompt}</Text>
        {answers.map((text, i) => (
          <Pressable key={i} style={styles.option} onPress={() => handleAnswer(i)} disabled={submitting}>
            <Text>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sub: { color: '#64748b' },
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  progress: { fontSize: 14, color: '#64748b', marginBottom: 12 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  prompt: { fontSize: 18, marginBottom: 20 },
  option: { padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', marginTop: 8 },
});
