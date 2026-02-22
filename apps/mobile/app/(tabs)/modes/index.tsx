import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';

type ModeConfig = {
  href: string | null;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  disabled?: boolean;
  pulse?: boolean;
};

const MODES: ModeConfig[] = [
  {
    href: '/(tabs)/modes/quick-fire',
    title: 'Quick Fire 10',
    subtitle: '60 sec · 10 Qs',
    icon: 'flash',
    colors: ['#ea580c', '#c2410c'],
    pulse: true,
  },
  {
    href: '/(tabs)/modes/history-10',
    title: 'History 10',
    subtitle: '60 sec · 10 Qs',
    icon: 'book',
    colors: ['#b45309', '#92400e'],
  },
  {
    href: '/(tabs)/modes/geography-10',
    title: 'Geography 10',
    subtitle: '60 sec · 10 Qs',
    icon: 'globe-outline',
    colors: ['#047857', '#065f46'],
  },
  {
    href: '/(tabs)/modes/capital-cities-10',
    title: 'Capital Cities 10',
    subtitle: '60 sec · 10 Qs',
    icon: 'business-outline',
    colors: ['#0d9488', '#0f766e'],
  },
  {
    href: '/(tabs)/modes/science-10',
    title: 'Science 10',
    subtitle: '60 sec · 10 Qs',
    icon: 'flask-outline',
    colors: ['#0369a1', '#075985'],
  },
  {
    href: '/(tabs)/modes/language-10',
    title: 'Language 10',
    subtitle: '60 sec · 10 Qs',
    icon: 'chatbubbles-outline',
    colors: ['#7c3aed', '#6d28d9'],
  },
  {
    href: '/(tabs)/modes/1v1',
    title: '1v1',
    subtitle: 'Duel & climb',
    icon: 'people',
    colors: ['#7c3aed', '#5b21b6'],
  },
  {
    href: '/(tabs)/modes/tournaments',
    title: 'Tournaments',
    subtitle: 'Global & National',
    icon: 'trophy',
    colors: ['#b45309', '#92400e'],
    pulse: true,
  },
  {
    href: '/(tabs)/modes/unlimited',
    title: 'Unlimited Quiz Questions',
    subtitle: 'No limit · Practice',
    icon: 'infinite',
    colors: ['#0e7490', '#155e75'],
  },
];

function AnimatedModeTile({
  config,
  index,
  isDark,
}: {
  config: ModeConfig;
  index: number;
  isDark: boolean;
}) {
  const router = useRouter();
  const entrance = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 90),
      Animated.parallel([
        Animated.timing(entrance, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [index, entrance]);

  useEffect(() => {
    if (!config.pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.04,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [config.pulse, pulseScale]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.94,
      useNativeDriver: true,
      friction: 8,
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
  const scaleEntrance = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  const content = (
    <LinearGradient
      colors={config.colors}
      style={styles.tileGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.tileShine} />
      {config.pulse && (
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>HOT</Text>
        </View>
      )}
      <View style={[styles.tileContent, config.disabled && styles.tileContentDisabled]}>
        <View style={styles.iconWrap}>
          <View style={styles.iconInnerRing} />
          <Ionicons name={config.icon} size={38} color="#fff" />
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {config.title}
        </Text>
        <Text style={styles.tileSubtitle} numberOfLines={1}>
          {config.subtitle}
        </Text>
        <View style={styles.playHint}>
          <Text style={styles.playHintText}>PLAY</Text>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.9)" />
        </View>
      </View>
    </LinearGradient>
  );

  const baseScale = config.pulse ? Animated.multiply(scaleEntrance, pulseScale) : scaleEntrance;
  const animatedStyle = {
    opacity,
    transform: [
      { translateY },
      { scale: Animated.multiply(baseScale, pressScale) },
    ],
  };

  if (config.disabled) {
    return (
      <Animated.View style={[styles.tileWrap, animatedStyle]}>
        <View style={styles.tileGlow} pointerEvents="none">
          <View style={styles.tileOuter}>{content}</View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.tileWrap, animatedStyle]}>
      <View style={[styles.tileGlow, { shadowColor: config.colors[0] }]}>
        <Pressable
          style={styles.tileOuter}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => config.href && router.push(config.href as any)}
          android_ripple={null}
        >
          {content}
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function ModesTab() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: 12 + insets.top + 16,
          paddingBottom: 40,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={isDark ? ['#1e1b4b', '#0f0a1f', '#0c0a14'] : ['#4c1d95', '#312e81', '#1e1b4b']}
        style={styles.headerGradient}
      >
        <View style={styles.headerAccent} />
        <Text style={styles.headerLabel}>SELECT MODE</Text>
        <Text style={styles.headerTitle}>Choose your challenge</Text>
        <Text style={styles.headerSubtitle}>Earn XP · Climb ranks · Compete</Text>
      </LinearGradient>

      <View style={styles.grid}>
        {MODES.map((config, index) => (
          <AnimatedModeTile
            key={config.title}
            config={config}
            index={index}
            isDark={!!isDark}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0a1f' },
  containerDark: { backgroundColor: '#0c0a14' },
  scrollContent: { padding: 16, paddingTop: 12 },
  headerGradient: {
    marginHorizontal: -16,
    marginBottom: 28,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderRadius: 0,
    overflow: 'hidden',
  },
  headerAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#a78bfa',
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tileWrap: {
    width: '48%',
    marginBottom: 18,
  },
  tileGlow: {
    borderRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  tileOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tileGradient: {
    flex: 1,
    borderRadius: 19,
    padding: 16,
    justifyContent: 'space-between',
  },
  tileShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 100,
    width: '75%',
    height: '55%',
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#fbbf24',
  },
  tileContent: { flex: 1, justifyContent: 'flex-end' },
  tileContentDisabled: { opacity: 0.85 },
  iconWrap: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tileSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '600',
    marginBottom: 6,
  },
  playHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playHintText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.9)',
  },
});
