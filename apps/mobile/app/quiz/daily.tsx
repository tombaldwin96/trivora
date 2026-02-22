import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function DailyQuizScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/quiz/daily/play');
  }, [router]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#f97316" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
});
