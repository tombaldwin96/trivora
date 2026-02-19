import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme-context';

export default function ModesLayout() {
  const { isDark } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: isDark ? '#0e0e10' : '#f8fafc' },
        headerTintColor: isDark ? '#fff' : '#0f172a',
        headerShadowVisible: !isDark,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Modes', headerShown: false }} />
      <Stack.Screen name="1v1" options={{ title: '1v1' }} />
    </Stack>
  );
}
