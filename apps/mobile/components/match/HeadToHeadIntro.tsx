/**
 * AAA-style pre-match head-to-head intro. Fullscreen overlay, synced by server time.
 * Do not block connection: this is purely visual; game connection runs in parallel.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { countryToFlagEmoji } from '@/lib/country';

export interface PlayerIntroData {
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  globalRank: number | null;
  countryCode: string | null;
  wins: number;
  draws: number;
  losses: number;
  title?: string | null;
}

const INTRO_DURATION_MS = 7000;
const VS_PULSE_DURATION = 1200;

interface HeadToHeadIntroProps {
  playerA: PlayerIntroData;
  playerB: PlayerIntroData;
  /** Called when intro should be hidden (transition to game). Caller drives this from server time. */
  onComplete?: () => void;
  /** Optional: total duration in ms; used for auto-callback if onComplete not driven by parent */
  durationMs?: number;
  /** Optional: e.g. "Round of 32" for tournament intro */
  roundLabel?: string | null;
}

function FlagOrPlaceholder({ countryCode }: { countryCode: string | null }) {
  const code = countryCode && countryCode.length >= 2 ? countryCode.slice(0, 2) : null;
  const emoji = code ? countryToFlagEmoji(code) : null;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
      delay: 600,
    }).start();
  }, [opacity]);
  if (!emoji) return <View style={styles.flagPlaceholder} />;
  return (
    <Animated.Text style={[styles.flagEmoji, { opacity }]} allowFontScaling={false}>
      {emoji}
    </Animated.Text>
  );
}

function PlayerCard({
  side,
  player,
}: {
  side: 'left' | 'right';
  player: PlayerIntroData;
}) {
  const translateX = useRef(new Animated.Value(side === 'left' ? -400 : 400)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rankOpacity = useRef(new Animated.Value(0)).current;
  const wdlOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
    const t1 = setTimeout(() => {
      Animated.timing(rankOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 350);
    const t2 = setTimeout(() => {
      Animated.timing(wdlOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // ignore
      }
    }, 650);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [translateX, opacity, rankOpacity, wdlOpacity]);

  const rankText = player.globalRank != null ? `#${player.globalRank}` : '—';

  return (
    <Animated.View
      style={[
        styles.playerCard,
        side === 'left' ? styles.playerCardLeft : styles.playerCardRight,
        { transform: [{ translateX }], opacity },
      ]}
    >
      <View style={styles.avatarWrap}>
        {player.avatarUrl ? (
          <Image source={{ uri: player.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter} numberOfLines={1}>
              {(player.username || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <FlagOrPlaceholder countryCode={player.countryCode} />
      </View>
      <Text style={styles.playerUsername} numberOfLines={1}>
        @{player.username || 'Player'}
      </Text>
      <Animated.View style={{ opacity: rankOpacity }}>
        <Text style={styles.playerLevel}>Level {player.level}</Text>
        <Text style={styles.playerRank}>{rankText}</Text>
        {player.title ? (
          <Text style={styles.playerTitle} numberOfLines={1}>
            {player.title}
          </Text>
        ) : null}
      </Animated.View>
      <Animated.View style={[styles.wdlRow, { opacity: wdlOpacity }]}>
        <Text style={styles.wdlText}>
          {player.wins}W – {player.draws}D – {player.losses}L
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

export function HeadToHeadIntro({
  playerA,
  playerB,
  onComplete,
  durationMs = INTRO_DURATION_MS,
  roundLabel,
}: HeadToHeadIntroProps) {
  const { width, height } = useWindowDimensions();
  const vsScale = useRef(new Animated.Value(0)).current;
  const vsOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(250),
      Animated.parallel([
        Animated.spring(vsScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 70,
        }),
        Animated.timing(vsOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.9,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: VS_PULSE_DURATION / 2,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: VS_PULSE_DURATION / 2,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]).start(({ finished }) => {
        if (finished) pulse();
      });
    };
    const t = setTimeout(pulse, 600);

    if (onComplete) {
      const endT = setTimeout(onComplete, durationMs);
      return () => {
        clearTimeout(t);
        clearTimeout(endT);
      };
    }
    return () => clearTimeout(t);
  }, [durationMs, onComplete, vsScale, vsOpacity, glowOpacity, pulseAnim]);

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <LinearGradient
        colors={['#0a0612', '#120a18', '#0d0814', '#0a0612']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glowBg, { width, height }]} />
      <Animated.View style={[styles.glowCenter, { opacity: glowOpacity }]} />

      <View style={styles.cardsRow}>
        <PlayerCard side="left" player={playerA} />
        <View style={styles.vsBlock}>
          <Animated.View
            style={[
              styles.vsGlow,
              {
                transform: [{ scale: Animated.multiply(pulseAnim, vsScale) }],
                opacity: vsOpacity,
              },
            ]}
          />
          <Animated.Text
            style={[styles.vsText, { transform: [{ scale: vsScale }], opacity: vsOpacity }]}
            allowFontScaling={false}
          >
            VS
          </Animated.Text>
        </View>
        <PlayerCard side="right" player={playerB} />
      </View>

      {roundLabel ? <Text style={styles.roundLabel}>{roundLabel}</Text> : null}
      <Text style={styles.tagline}>BATTLE BEGINS</Text>
      {/* Optional: sound hook - play subtle whoosh when VS appears */}
    </View>
  );
}

const styles = StyleSheet.create({
  glowBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.4,
  },
  glowCenter: {
    position: 'absolute',
    left: '50%',
    top: '38%',
    width: 200,
    height: 200,
    marginLeft: -100,
    marginTop: -100,
    borderRadius: 100,
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 80,
    flex: 1,
  },
  playerCard: {
    width: 110,
    alignItems: 'center',
  },
  playerCardLeft: {},
  playerCardRight: {},
  avatarWrap: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1f2937',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 28,
    fontWeight: '700',
    color: '#9ca3af',
  },
  flagEmoji: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    fontSize: 20,
  },
  flagPlaceholder: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
  },
  playerUsername: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: 4,
    maxWidth: 100,
  },
  playerLevel: {
    fontSize: 11,
    color: '#f97316',
    fontWeight: '700',
  },
  playerRank: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  playerTitle: {
    fontSize: 10,
    color: '#a78bfa',
    marginTop: 2,
    maxWidth: 90,
  },
  wdlRow: {
    marginTop: 6,
  },
  wdlText: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '600',
  },
  vsBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
  },
  vsGlow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(249, 115, 22, 0.35)',
  },
  vsText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  roundLabel: {
    position: 'absolute',
    bottom: 128,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 2,
  },
  tagline: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 4,
  },
});
