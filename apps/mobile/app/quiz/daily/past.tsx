import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type AttemptRow = {
  id: string;
  started_at: string;
  score_total: number;
  detail_json: unknown[] | null;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function correctCount(detail: unknown[] | null): number {
  if (!Array.isArray(detail)) return 0;
  return detail.filter((d: { correct?: boolean }) => d.correct).length;
}

export default function PastQuizzesScreen() {
  const router = useRouter();
  const [quizId, setQuizId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id')
      .eq('type', 'daily')
      .eq('status', 'published')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setQuizId(data?.id ?? null));
  }, []);

  useEffect(() => {
    if (!quizId) {
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      supabase
        .from('attempts')
        .select('id, started_at, score_total, detail_json')
        .eq('user_id', user.id)
        .eq('quiz_id', quizId)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          setAttempts((data ?? []) as AttemptRow[]);
          setLoading(false);
        });
    });
  }, [quizId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Past Daily Quizzes</Text>
      <Text style={styles.subtitle}>Tap a row to see full result</Text>
      {attempts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="calendar-outline" size={48} color="#94a3b8" />
          <Text style={styles.emptyText}>No completed quizzes yet.</Text>
          <Text style={styles.emptySub}>Complete today’s quiz to see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={attempts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const correct = correctCount(item.detail_json);
            const total = Array.isArray(item.detail_json) ? item.detail_json.length : 0;
            const resultLabel = total > 0 ? `${correct}/${total} correct · ${item.score_total} pts` : `${item.score_total} pts`;
            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push({ pathname: '/quiz/daily/result', params: { attempt_id: item.id } })}
              >
                <Text style={styles.rowDate}>{formatDate(item.started_at)}</Text>
                <Text style={styles.rowResult}>{resultLabel}</Text>
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowDate: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  rowResult: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 8,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
});
