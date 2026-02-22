import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

export default function TournamentScreen() {
  const { isDark } = useTheme();
  const [notifyStatus, setNotifyStatus] = useState<boolean | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifyStatus(status === 'granted');
    });
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const shine = Animated.loop(
      Animated.sequence([
        Animated.timing(shineOpacity, {
          toValue: 0.15,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shineOpacity, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      { delay: 800 }
    );
    shine.start();
    return () => shine.stop();
  }, [shineOpacity]);

  async function handleEnableNotifications() {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') {
        setNotifyStatus(true);
        Alert.alert(
          'You\'re all set',
          'You\'ll be the first to know when worldwide tournaments open in Summer 2026.',
          [{ text: 'OK' }]
        );
        return;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      setNotifyStatus(status === 'granted');
      if (status === 'granted') {
        Alert.alert(
          'Notifications enabled',
          'We\'ll notify you when tournament registration opens. Get ready to compete globally.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Enable in Settings',
          'To get notified when tournaments launch and registration opens, enable notifications for this app in Settings.',
          [
            { text: 'Not now' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch {
      Alert.alert('Error', 'Could not update notification settings. Try again in Settings.');
    }
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.bannerWrap}>
        <LinearGradient
          colors={isDark ? ['#1e1b4b', '#312e81', '#1e3a5f'] : ['#4c1d95', '#5b21b6', '#1e40af']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bannerGradient}
        />
        <Animated.View
          style={[
            styles.bannerShine,
            {
              opacity: shineOpacity,
            },
          ]}
          pointerEvents="none"
        />
        <View style={styles.bannerContent}>
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>COMING SUMMER 2026</Text>
          </View>
          <Text style={styles.bannerHeadline}>
            Worldwide Quiz{'\n'}Tournaments
          </Text>
          <Text style={styles.bannerSub}>
            Compete on a global stage. We're launching official Trivora tournaments in Summer 2026—brackets, prizes, and bragging rights.
          </Text>
          <Text style={styles.bannerCta}>
            Turn on push notifications to be the first to know when registration opens and to secure your spot.
          </Text>
          {notifyStatus !== true && (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable
                style={({ pressed }) => [styles.bannerBtn, pressed && styles.bannerBtnPressed]}
                onPress={handleEnableNotifications}
              >
                <LinearGradient
                  colors={['#f59e0b', '#d97706']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.bannerBtnGradient}
                >
                  <Text style={styles.bannerBtnText}>Turn on notifications</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}
          {notifyStatus === true && (
            <View style={styles.bannerEnabled}>
              <Text style={styles.bannerEnabledText}>✓ Notifications enabled — we'll notify you when it's time.</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  bannerWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 340,
    ...Platform.select({
      ios: {
        shadowColor: '#5b21b6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderRadius: 24,
  },
  bannerContent: {
    padding: 28,
    paddingTop: 24,
  },
  bannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251, 191, 36, 0.25)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
  },
  bannerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 1.2,
  },
  bannerHeadline: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 34,
    marginBottom: 12,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  bannerSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 22,
    marginBottom: 14,
  },
  bannerCta: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
    marginBottom: 22,
    fontWeight: '600',
  },
  bannerBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    ...Platform.select({
      ios: {
        shadowColor: '#d97706',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  bannerBtnPressed: { opacity: 0.9 },
  bannerBtnGradient: {
    paddingVertical: 16,
    paddingHorizontal: 28,
  },
  bannerBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  bannerEnabled: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  bannerEnabledText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#86efac',
  },
});
