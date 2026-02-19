import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function DailyQuizScreen() {
  const router = useRouter();
  const [quizId, setQuizId] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('quizzes').select('id').eq('type', 'daily').eq('status', 'published').limit(1).single().then(({ data }) => setQuizId(data?.id ?? null));
  }, []);

  useEffect(() => {
    if (!quizId) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const today = new Date().toISOString().slice(0, 10);
      supabase.from('attempts').select('id, score_total, ended_at').eq('user_id', user.id).eq('quiz_id', quizId).gte('started_at', today + 'T00:00:00Z').order('started_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
        if (data?.ended_at) setScore(data.score_total);
        else if (data?.id) setAttemptId(data.id);
      });
    });
  }, [quizId]);

  function startOrContinue() {
    if (attemptId) router.push({ pathname: '/quiz/daily/play', params: { quiz_id: quizId, attempt_id: attemptId } });
    else router.push({ pathname: '/quiz/daily/play', params: { quiz_id: quizId } });
  }

  if (score !== null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Today&apos;s quiz complete</Text>
        <Text style={styles.score}>{score} pts</Text>
        <Pressable style={styles.button} onPress={() => router.push('/(tabs)/leaderboards')}>
          <Text style={styles.buttonText}>View leaderboard</Text>
        </Pressable>
      </View>
    );
  }

  if (!quizId) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>No daily quiz available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Quiz</Text>
      <Text style={styles.subtitle}>10 questions · Score + time bonus</Text>
      <Pressable style={styles.button} onPress={startOrContinue}>
        <Text style={styles.buttonText}>{attemptId ? 'Continue' : 'Start'} quiz</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#64748b', marginBottom: 24 },
  score: { fontSize: 32, fontWeight: '700', color: '#4f46e5', marginBottom: 24 },
  button: { backgroundColor: '#4f46e5', padding: 16, borderRadius: 12 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
});
