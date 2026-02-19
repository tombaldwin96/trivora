import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function DailyQuizResultScreen() {
  const { attempt_id } = useLocalSearchParams<{ attempt_id: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<{ score_total: number; detail_json: unknown[] } | null>(null);

  useEffect(() => {
    if (!attempt_id) return;
    supabase.from('attempts').select('score_total, detail_json').eq('id', attempt_id).single().then(({ data }) => setAttempt(data ?? null));
  }, [attempt_id]);

  const details = (attempt?.detail_json ?? []) as { correct?: boolean }[];
  const correctCount = details.filter((d) => d.correct).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quiz complete</Text>
      <Text style={styles.score}>{attempt?.score_total ?? 0} pts</Text>
      <Text style={styles.sub}>{correctCount} / {details.length || 0} correct</Text>
      <Pressable style={styles.button} onPress={() => router.push('/(tabs)/leaderboards')}>
        <Text style={styles.buttonText}>View leaderboard</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => router.push('/(tabs)')}>
        <Text style={styles.secondaryText}>Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  score: { fontSize: 36, fontWeight: '700', color: '#4f46e5', textAlign: 'center', marginTop: 16 },
  sub: { color: '#64748b', textAlign: 'center', marginTop: 8 },
  button: { backgroundColor: '#4f46e5', padding: 16, borderRadius: 12, marginTop: 24 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  secondary: { marginTop: 12 },
  secondaryText: { color: '#64748b', textAlign: 'center' },
});
