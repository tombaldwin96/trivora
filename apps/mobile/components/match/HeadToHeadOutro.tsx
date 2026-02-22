/**
 * Post-match result cinematic: winner highlight, XP, rank change, Victory/Defeat banner.
 * Shown when outro_started_at is set; duration driven by server (outro_duration_ms).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

export interface OutroPlayerData {
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  isWinner: boolean;
  isDraw: boolean;
}

interface HeadToHeadOutroProps {
  /** Current user's data */
  me: OutroPlayerData;
  /** Opponent data */
  opponent: OutroPlayerData;
  /** XP earned this match */
  xpEarned: number;
  /** Rank before (optional); after can be derived or passed */
  rankBefore?: number | null;
  rankAfter?: number | null;
  /** Called when outro should be hidden (e.g. show result modal). Caller drives from server time. */
  onComplete?: () => void;
  /** Duration in ms; used for auto-callback if onComplete not driven by parent */
  durationMs?: number;
  /** Tournament: override banner text for winner/loser (e.g. "Advance to Round of 16" / "Eliminated") */
  tournamentOutcome?: { winner: string; loser: string };
}

const OUTRO_DURATION_MS = 2500;

export function HeadToHeadOutro({
  me,
  opponent,
  xpEarned,
  rankBefore,
  rankAfter,
  onComplete,
  durationMs = OUTRO_DURATION_MS,
  tournamentOutcome,
}: HeadToHeadOutroProps) {
  const { width, height } = useWindowDimensions();
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerScale = useRef(new Animated.Value(0.8)).current;
  const winnerGlow = useRef(new Animated.Value(0)).current;
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpCount = useRef(new Animated.Value(0)).current;
  const [xpDisplay, setXpDisplay] = useState(0);
  const rankOpacity = useRef(new Animated.Value(0)).current;

  const won = me.isWinner;
  const drew = me.isDraw;
  const outcome = drew
    ? 'DRAW'
    : won
      ? (tournamentOutcome?.winner ?? 'VICTORY')
      : (tournamentOutcome?.loser ?? 'DEFEAT');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(bannerScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }),
    ]).start();

    if (won) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // ignore
      }
      Animated.timing(winnerGlow, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        delay: 200,
      }).start();
    }

    // XP count-up
    Animated.timing(xpOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
      delay: 500,
    }).start();
    const xpDuration = 800;
    const xpStart = 600;
    const xpAnim = Animated.timing(xpCount, {
      toValue: 1,
      duration: xpDuration,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    });
    const xpTimer = setTimeout(() => {
      xpAnim.start();
    }, xpStart);
    const listenerId = xpCount.addListener(({ value }) => {
      setXpDisplay(Math.round(value * xpEarned));
    });
    const xpClean = setTimeout(() => {
      setXpDisplay(xpEarned);
      xpCount.removeListener(listenerId);
    }, xpStart + xpDuration + 100);

    if (rankAfter != null || rankBefore != null) {
      Animated.timing(rankOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
        delay: 1000,
      }).start();
    }

    if (onComplete) {
      const endT = setTimeout(onComplete, durationMs);
      return () => {
        clearTimeout(xpTimer);
        clearTimeout(xpClean);
        clearTimeout(endT);
        xpCount.removeListener(listenerId);
      };
    }
    return () => {
      clearTimeout(xpTimer);
      clearTimeout(xpClean);
      xpCount.removeListener(listenerId);
    };
  }, [
    bannerOpacity,
    bannerScale,
    winnerGlow,
    xpOpacity,
    xpCount,
    xpEarned,
    durationMs,
    onComplete,
    won,
  ]);

  const rankText =
    rankAfter != null && rankBefore != null
      ? `#${rankBefore} → #${rankAfter}`
      : rankAfter != null
        ? `#${rankAfter}`
        : rankBefore != null
          ? `#${rankBefore}`
          : null;

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <LinearGradient
        colors={['#0a0612', '#120a18', '#0d0814']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.vignette, { width, height }]} />

      <Animated.View
        style={[
          styles.bannerWrap,
          {
            opacity: bannerOpacity,
            transform: [{ scale: bannerScale }],
          },
        ]}
      >
        <LinearGradient
          colors={
            drew
              ? ['#475569', '#334155']
              : won
                ? ['#f59e0b', '#d97706', '#b45309']
                : ['#7f1d1d', '#991b1b']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bannerGradient}
        >
          {won && (
            <Ionicons
              name="trophy"
              size={40}
              color="rgba(254, 240, 138, 0.9)"
              style={styles.bannerIcon}
            />
          )}
          <Text style={styles.bannerText}>{outcome}</Text>
          <Text style={styles.bannerSub}>
            {me.score} – {opponent.score} vs @{opponent.username}
          </Text>
        </LinearGradient>
      </Animated.View>

      {won && (
        <Animated.View
          style={[
            styles.winnerGlow,
            {
              opacity: winnerGlow.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.25],
              }),
            },
          ]}
        />
      )}

      <Animated.View style={[styles.xpBox, { opacity: xpOpacity }]}>
        <Text style={styles.xpLabel}>XP earned</Text>
        <Text style={styles.xpValue}>+{xpDisplay}</Text>
      </Animated.View>

      {rankText && (
        <Animated.View style={[styles.rankBox, { opacity: rankOpacity }]}>
          <Text style={styles.rankText}>{rankText}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.3,
  },
  bannerWrap: {
    position: 'absolute',
    top: '28%',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  bannerGradient: {
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 260,
  },
  bannerIcon: {
    marginBottom: 8,
  },
  bannerText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  bannerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
  },
  winnerGlow: {
    position: 'absolute',
    top: '20%',
    left: '50%',
    marginLeft: -120,
    width: 240,
    height: 160,
    borderRadius: 120,
    backgroundColor: '#fef08a',
  },
  xpBox: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  xpLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  xpValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#22c55e',
    marginTop: 4,
  },
  rankBox: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a78bfa',
  },
});
