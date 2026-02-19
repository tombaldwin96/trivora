import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme-context';

export default function TournamentScreen() {
  const { isDark } = useTheme();

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Join a tournament</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        Bracket tournaments · Coming in V1
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  titleDark: { color: '#efeff1' },
  subtitle: { fontSize: 14, color: '#64748b' },
  subtitleDark: { color: '#adadb8' },
});
