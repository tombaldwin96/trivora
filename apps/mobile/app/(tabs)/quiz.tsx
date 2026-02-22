import { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';

type QuizOptionConfig = {
  href: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  accentColor: string;
};

const OPTIONS: QuizOptionConfig[] = [
  {
    href: '/quiz/daily/play',
    title: "Today's Challenge",
    subtitle: '10 questions · Score big and climb the ranks',
    icon: 'flash',
    colors: ['#4c1d95', '#6d28d9', '#7c3aed'],
    accentColor: '#c4b5fd',
  },
  {
    href: '/quiz/daily/play',
    title: "Yesterday's Run",
    subtitle: 'Catch up and beat your previous score',
    icon: 'time',
    colors: ['#0c4a6e', '#0e7490', '#06b6d4'],
    accentColor: '#67e8f9',
  },
];

function AnimatedQuizTile({
  config,
  index,
  isDark,
}: {
  config: QuizOptionConfig;
  index: number;
  isDark: boolean;
}) {
  const router = useRouter();
  const pressScale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 120),
      Animated.timing(entrance, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, entrance]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.97,
      useNativeDriver: true,
      friction: 10,
      tension: 200,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };

  const opacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  const content = (
    <LinearGradient
      colors={config.colors as [string, string, ...string[]]}
      style={styles.tileGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.tileShine} />
      <View style={[styles.tileGlow, { backgroundColor: config.accentColor + '18' }]} />
      <View style={styles.tileContent}>
        <View style={[styles.iconWrap, { backgroundColor: config.accentColor + '28' }]}>
          <View style={styles.iconInnerRing} />
          <Ionicons name={config.icon} size={44} color="#fff" />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.tileTitle} numberOfLines={1}>
            {config.title}
          </Text>
          <Text style={styles.tileSubtitle} numberOfLines={2}>
            {config.subtitle}
          </Text>
          <View style={styles.playRow}>
            <Text style={[styles.playLabel, { color: config.accentColor }]}>PLAY</Text>
            <Ionicons name="chevron-forward" size={18} color={config.accentColor} />
          </View>
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <Animated.View
      style={[
        styles.tileWrap,
        {
          opacity,
          transform: [{ translateY }, { scale: pressScale }],
        },
      ]}
    >
      <View style={[styles.tileGlowWrap, { shadowColor: config.colors[0] }]}>
        <Pressable
          style={styles.tilePressable}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => router.push(config.href as any)}
          android_ripple={null}
        >
          <View style={[styles.tileOuterInner, { borderColor: 'rgba(255,255,255,0.2)' }]}>
            {content}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function getLocalDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function computeStreak(endedAtValues: string[]): number {
  if (endedAtValues.length === 0) return 0;
  const now = new Date();
  const today = getLocalDateStr(now);
  const yesterday = getLocalDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const dateSet = new Set<string>();
  endedAtValues.forEach((iso) => {
    const d = getLocalDateStr(new Date(iso));
    dateSet.add(d);
  });
  const sorted = Array.from(dateSet).sort().reverse();
  const mostRecent = sorted[0];
  if (mostRecent < yesterday) return 0;
  let streak = 1;
  let anchor = new Date(mostRecent + 'T12:00:00');
  for (;;) {
    anchor.setDate(anchor.getDate() - 1);
    const prev = getLocalDateStr(anchor);
    if (!dateSet.has(prev)) break;
    streak++;
  }
  return streak;
}

export default function QuizTab() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [totalDailyPlayed, setTotalDailyPlayed] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('total_daily_quizzes_completed')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setTotalDailyPlayed(data?.total_daily_quizzes_completed ?? 0));

      supabase
        .from('attempts')
        .select('ended_at')
        .eq('user_id', user.id)
        .eq('mode', 'daily')
        .not('ended_at', 'is', null)
        .then(({ data }) => {
          const dates = (data ?? []).map((r) => r.ended_at as string).filter(Boolean);
          setStreak(computeStreak(dates));
        });
    });
  }, []);

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <LinearGradient
        colors={isDark ? ['#0f0a1f', '#1a0a2e', '#0c0a14'] : ['#0f0a1f', '#1e1b4b', '#0c0a14']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.inner, { paddingTop: 12 + insets.top + (isDark ? 44 : 12) }]}>
        <LinearGradient
          colors={['#1e1b4b', '#312e81', '#1e1b4b']}
          style={styles.heroGradient}
        >
          <View style={styles.heroAccent} />
          <Text style={styles.heroLabel}>DAILY QUIZ</Text>
          <Text style={styles.heroTitle}>Play and compete, daily.</Text>
          <Text style={styles.heroSubtitle}>
            10 questions · correctness + speed · Earn XP
          </Text>
        </LinearGradient>

        <View style={styles.tiles}>
          {OPTIONS.map((config, index) => (
            <AnimatedQuizTile
              key={config.title}
              config={config}
              index={index}
              isDark={!!isDark}
            />
          ))}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Days played</Text>
            <Text style={styles.statValue}>
              {totalDailyPlayed ?? '—'}
            </Text>
            <View style={[styles.statIconWrap, styles.statIconPlayed]}>
              <Ionicons name="calendar" size={20} color="#a78bfa" />
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Streak</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>
                {streak === null ? '—' : streak}
              </Text>
              {streak === 0 && <Text style={styles.statEmoji}>😢</Text>}
              {streak !== null && streak > 3 && <Text style={styles.statEmoji}>🔥</Text>}
            </View>
            <View style={[styles.statIconWrap, streak !== null && streak > 0 ? styles.statIconStreakOn : styles.statIconStreakOff]}>
              <Ionicons name="flame" size={20} color={streak !== null && streak > 0 ? '#f97316' : '#64748b'} />
            </View>
          </View>
        </View>

        <View style={styles.spacer} />
        <View style={styles.footer}>
          <Image
            source={require('@/assets/Logo.png')}
            style={styles.footerLogo}
            resizeMode="contain"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: {},
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  heroGradient: {
    marginHorizontal: -24,
    marginBottom: 28,
    paddingVertical: 20,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: '#a78bfa',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: '#fff',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  tiles: { gap: 18 },
  tileWrap: { width: '100%' },
  tileGlowWrap: {
    borderRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  tilePressable: { width: '100%' },
  tileOuterInner: {
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    minHeight: 120,
  },
  tileGradient: {
    flex: 1,
    borderRadius: 21,
    padding: 22,
    minHeight: 120,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  tileShine: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '60%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopRightRadius: 21,
    borderBottomLeftRadius: 100,
  },
  tileGlow: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  tileContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  textBlock: { flex: 1, justifyContent: 'center' },
  tileTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tileSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '600',
    marginBottom: 10,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    minHeight: 100,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#a78bfa',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statEmoji: { fontSize: 28 },
  statIconWrap: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconPlayed: { backgroundColor: 'rgba(124, 58, 237, 0.3)' },
  statIconStreakOn: { backgroundColor: 'rgba(249, 115, 22, 0.3)' },
  statIconStreakOff: { backgroundColor: 'rgba(100, 116, 139, 0.25)' },
  spacer: { flex: 1 },
  footer: { alignSelf: 'center', opacity: 0.85 },
  footerLogo: { width: 88, height: 88 },
});
