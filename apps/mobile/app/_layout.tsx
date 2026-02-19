import { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const PRELOAD_DURATION_MS = 2000;

function StackLayout() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'auto'} />
      <Stack screenOptions={{ headerShown: true, headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/verify-otp" options={{ title: 'Enter code' }} />
        <Stack.Screen name="auth/callback" options={{ title: 'Signing in…', headerShown: false }} />
        <Stack.Screen name="auth/signin" options={{ title: 'Sign in' }} />
        <Stack.Screen name="auth/signup" options={{ title: 'Sign up' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: isDark ? '#0e0e10' : undefined },
            headerTintColor: isDark ? '#fff' : undefined,
            headerShadowVisible: !isDark,
          }}
        />
        <Stack.Screen name="match/[id]" options={{ title: '1v1 Match', headerBackTitle: 'Back' }} />
        <Stack.Screen name="quiz/daily/past" options={{ title: 'Past Quizzes', headerBackTitle: 'Back' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [showPreload, setShowPreload] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowPreload(false), PRELOAD_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  if (showPreload) {
    return (
      <>
        <StatusBar style="light" />
        <View style={styles.preloadWrap}>
          <Image
            source={require('@/assets/preload.png')}
            style={styles.preloadImage}
            resizeMode="stretch"
          />
        </View>
      </>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <StackLayout />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  preloadWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  preloadImage: {
    width: '100%',
    height: '100%',
  },
});
