import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme-context';

export default function LeaderboardsLayout() {
  const { isDark } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: isDark ? '#0e0e10' : '#f8fafc' },
        headerTintColor: isDark ? '#fff' : '#111827',
        headerShadowVisible: !isDark,
      }}
    >
      <Stack.Screen
        name="daily"
        options={{
          title: "Today's Daily Quiz",
          headerTitle: "Daily Quiz Leaderboard",
        }}
      />
    </Stack>
  );
}
