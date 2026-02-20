import React, { Suspense, useEffect, useRef, useState } from 'react';
import { View, Image, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { XpProvider } from '@/lib/xp-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Lazy-load to avoid running their (and deps') code during initial bundle execution; reduces Hermes/native crash risk at boot.
const LazyInviteListener = React.lazy(() =>
  import('@/components/InviteListener').then((m) => ({ default: m.InviteListener }))
);
const LazyPushTokenRegistration = React.lazy(() =>
  import('@/components/PushTokenRegistration').then((m) => ({ default: m.PushTokenRegistration }))
);
const LazyPresenceHeartbeat = React.lazy(() =>
  import('@/components/PresenceHeartbeat').then((m) => ({ default: m.PresenceHeartbeat }))
);

/** Delay (ms) before mounting native-heavy components after app is visible. Avoids Hermes/native crash in RN error path at boot. */
const DEFER_NATIVE_MS = 1000;

/** Mounts children after first paint + delay so native/error paths don't run during critical boot. */
function DeferNativeModules({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let rafId: number;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => setReady(true), DEFER_NATIVE_MS);
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);
  if (!ready) return null;
  return <>{children}</>;
}

const PRELOAD_LOGO_SIZE = 225;
const PRELOAD_DURATION_MS = 2400;
const SHINE_WIDTH = 100;

function PreloadScreen({ onComplete }: { onComplete: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const shineX = useRef(new Animated.Value(-SHINE_WIDTH - PRELOAD_LOGO_SIZE)).current;
  const taglineTranslateY = useRef(new Animated.Value(24)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeIn = Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const scaleUp = Animated.spring(scale, {
      toValue: 1.04,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    });
    const settle = Animated.timing(scale, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const shine = Animated.timing(shineX, {
      toValue: PRELOAD_LOGO_SIZE + SHINE_WIDTH,
      duration: 700,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    const delayShine = Animated.delay(350);
    const delayComplete = Animated.delay(650);
    const taglineSlide = Animated.parallel([
      Animated.timing(taglineTranslateY, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    const delayTagline = Animated.delay(400);

    const sequence = Animated.sequence([
      Animated.parallel([fadeIn, scaleUp]),
      Animated.sequence([settle, delayShine]),
      Animated.parallel([shine, Animated.sequence([delayTagline, taglineSlide])]),
      delayComplete,
    ]);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = null;
      onComplete();
    };
    sequence.start(({ finished }) => {
      if (finished) done();
    });
    // Fallback: leave splash after 4s if animation doesn't complete (e.g. iOS)
    timeoutId = setTimeout(done, 4000);
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [onComplete, opacity, scale, shineX, taglineTranslateY, taglineOpacity]);

  return (
    <View style={styles.preloadWrap}>
      <View style={[styles.logoClip, { width: PRELOAD_LOGO_SIZE, height: PRELOAD_LOGO_SIZE }]}>
        <Animated.View
          style={[
            styles.logoWrap,
            {
              width: PRELOAD_LOGO_SIZE,
              height: PRELOAD_LOGO_SIZE,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <Image
            source={require('@/assets/Logo.png')}
            style={[styles.preloadLogo, { width: PRELOAD_LOGO_SIZE, height: PRELOAD_LOGO_SIZE }]}
            resizeMode="contain"
          />
          <View style={styles.shineOverlay} pointerEvents="none">
            <Animated.View style={[styles.shineStrip, { transform: [{ translateX: shineX }] }]}>
              <LinearGradient
                colors={[
                  'transparent',
                  'rgba(255,255,255,0.08)',
                  'rgba(255,255,255,0.45)',
                  'rgba(255,255,255,0.6)',
                  'rgba(255,255,255,0.45)',
                  'rgba(255,255,255,0.08)',
                  'transparent',
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.shineGradient}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
      <Animated.Text
        style={[
          styles.preloadTagline,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineTranslateY }],
          },
        ]}
      >
        Outthink. Outplay. Outrank.
      </Animated.Text>
    </View>
  );
}

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
        <Stack.Screen
          name="contact"
          options={{
            title: 'Share your idea',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: isDark ? '#0e0e10' : undefined },
            headerTintColor: isDark ? '#fff' : undefined,
            headerShadowVisible: !isDark,
          }}
        />
        <Stack.Screen
          name="match/[id]"
          options={{
            title: '1v1 Match',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="quiz/daily/play"
          options={{
            title: "Today's Daily Quiz",
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTintColor: '#fff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="quiz/daily"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen name="quiz/daily/past" options={{ title: 'Past Quizzes', headerBackTitle: 'Back' }} />
        <Stack.Screen
          name="leaderboards"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

/** Blank screen after preload before any app code runs (iOS boot crash workaround). */
const BOOT_DELAY_MS = 1200;
/** After appReady, wait this long before mounting router/Theme/Xp/Supabase tree. */
const SAFE_GATE_MS = 2500;

export default function RootLayout() {
  const [showPreload, setShowPreload] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [appTreeReady, setAppTreeReady] = useState(false);

  useEffect(() => {
    if (!showPreload && !appReady) {
      const id = setTimeout(() => setAppReady(true), BOOT_DELAY_MS);
      return () => clearTimeout(id);
    }
  }, [showPreload, appReady]);

  useEffect(() => {
    if (!appReady || appTreeReady) return;
    const id = setTimeout(() => setAppTreeReady(true), SAFE_GATE_MS);
    return () => clearTimeout(id);
  }, [appReady, appTreeReady]);

  if (showPreload) {
    return (
      <>
        <StatusBar style="dark" />
        <PreloadScreen onComplete={() => setShowPreload(false)} />
      </>
    );
  }

  if (!appReady) {
    return <View style={styles.bootDelay} />;
  }

  if (!appTreeReady) {
    return <View style={[styles.bootDelay, styles.safeGate]} />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <XpProvider>
          <StackLayout />
          <DeferNativeModules>
            <Suspense fallback={null}>
              <LazyInviteListener />
              <LazyPushTokenRegistration />
              <LazyPresenceHeartbeat />
            </Suspense>
          </DeferNativeModules>
        </XpProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  bootDelay: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  safeGate: {
    backgroundColor: '#f1f5f9',
  },
  preloadWrap: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoClip: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  logoWrap: {
    position: 'relative',
  },
  preloadLogo: {},
  shineOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 12,
  },
  shineStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SHINE_WIDTH,
  },
  shineGradient: {
    flex: 1,
    width: SHINE_WIDTH,
  },
  preloadTagline: {
    marginTop: 20,
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
});
