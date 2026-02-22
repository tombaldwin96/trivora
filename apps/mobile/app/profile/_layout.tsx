import { Pressable, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';

export default function ProfileLayout() {
  const { isDark } = useTheme();
  const router = useRouter();
  const tint = isDark ? '#fff' : undefined;
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: isDark ? '#0e0e10' : undefined },
        headerTintColor: tint,
        headerShadowVisible: !isDark,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={{ padding: 8, marginLeft: 4 }} hitSlop={16}>
            <Ionicons name="chevron-back" size={24} color={tint ?? '#000'} />
          </Pressable>
        ),
      }}
    >
      <Stack.Screen
        name="friends"
        options={{
          title: 'Friends',
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff', fontWeight: '700' },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ padding: 8, marginLeft: 4 }} hitSlop={16}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Profile' }} />
    </Stack>
  );
}
