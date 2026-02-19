import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useThrottledLiveSession } from '@/lib/live-quiz-client';

/**
 * Live quiz session: video stream + time-sensitive answers.
 * - Session state comes from useThrottledLiveSession (throttled so video isn't janked).
 * - When you add question UI, use useSubmitLiveAnswer() for immediate, single-flight submits.
 * - Do NOT subscribe to live_answers realtime (too high volume); use live_sessions only.
 */
export default function LiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useThrottledLiveSession(id ?? null);

  if (!id) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Missing session.</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        {session == null ? (
          <ActivityIndicator size="large" color="#9146ff" />
        ) : (
          <>
            <Text style={styles.title}>Live Quiz</Text>
            <Text style={styles.subtitle}>
              Session: {id} · {session.status}
            </Text>
            {session.playback_url ? (
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoPlaceholderText}>
                  Video: {session.playback_url.slice(0, 40)}…
                </Text>
                <Text style={styles.hint}>
                  Use expo-av or similar for playback. Realtime session updates are throttled so
                  video stays smooth.
                </Text>
              </View>
            ) : (
              <Text style={styles.placeholder}>
                Not live yet. When it goes live, video and questions will appear here. Use
                useSubmitLiveAnswer() for answers (immediate send, one per question).
              </Text>
            )}
          </>
        )}
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  placeholder: { fontSize: 14, color: '#94a3b8' },
  videoPlaceholder: { marginTop: 8 },
  videoPlaceholderText: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  hint: { fontSize: 12, color: '#94a3b8' },
});
