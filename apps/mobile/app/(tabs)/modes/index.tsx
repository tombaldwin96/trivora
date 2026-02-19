import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { ImageCard } from '@/components/ImageCard';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';
import { useTheme } from '@/lib/theme-context';

export default function ModesTab() {
  const { isDark } = useTheme();
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Game modes</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>Pick a mode and compete</Text>
      <Link href="/modes/1v1" asChild>
        <ImageCard
          source={{ uri: PLACEHOLDER_IMAGES.oneVone }}
          title="1v1"
          subtitle="Invite or matchmake · Divisions"
        />
      </Link>
      <ImageCard
        source={{ uri: PLACEHOLDER_IMAGES.arena }}
        title="Arena"
        subtitle="Coming in V1"
        disabled
      />
      <ImageCard
        source={{ uri: PLACEHOLDER_IMAGES.tournament }}
        title="Tournaments"
        subtitle="Coming in V1"
        disabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  titleDark: { color: '#efeff1' },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  subtitleDark: { color: '#adadb8' },
});
