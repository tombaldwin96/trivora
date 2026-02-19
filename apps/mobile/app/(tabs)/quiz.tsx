import { View, Text, StyleSheet, Image } from 'react-native';
import { Link } from 'expo-router';
import { ImageCard } from '@/components/ImageCard';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';
import { useTheme } from '@/lib/theme-context';

export default function QuizTab() {
  const { isDark } = useTheme();
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View>
        <Text style={[styles.title, isDark && styles.titleDark]}>Daily Quiz</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>10 questions · correctness + speed</Text>
        <Link href="/quiz/daily" asChild>
          <ImageCard
            source={{ uri: PLACEHOLDER_IMAGES.dailyQuiz }}
            title="Play today's quiz"
            subtitle="Score points and climb the leaderboard"
          />
        </Link>
        <View style={styles.secondCard}>
          <Link href="/quiz/daily" asChild>
            <ImageCard
              source={{ uri: PLACEHOLDER_IMAGES.dailyQuiz }}
              title="Play yesterday's quiz"
              subtitle="Catch up on yesterday's quiz. Will expire at midnight."
            />
          </Link>
        </View>
      </View>
      <View style={styles.spacer} />
      <View style={styles.footerMahan}>
        <Image source={require('@/assets/mahan.png')} style={styles.footerMahanImage} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingBottom: 24, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  titleDark: { color: '#efeff1' },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  subtitleDark: { color: '#adadb8' },
  secondCard: { marginTop: 12 },
  spacer: { flex: 1 },
  footerMahan: { alignSelf: 'center', marginBottom: 0 },
  footerMahanImage: { width: 100, height: 100 },
});
