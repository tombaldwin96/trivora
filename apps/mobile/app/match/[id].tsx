import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Vibration,
  Platform,
  Modal,
  Image,
  Animated,
  Easing,
  useWindowDimensions,
  Share,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { scoreSingleAnswer } from '@trivora/core';
import { debounce } from '@/lib/debounce';
import { useXp, XP, xpForLevel, pointsForLevel, levelFromXp } from '@/lib/xp-context';
import { useResponsive, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { Ionicons } from '@expo/vector-icons';
import { useSynchronizedMatchTimer } from '@/hooks/useSynchronizedMatchTimer';
import { HeadToHeadIntro, type PlayerIntroData } from '@/components/match/HeadToHeadIntro';
import { HeadToHeadOutro } from '@/components/match/HeadToHeadOutro';
import { syncServerTime, estimatedServerTimeMs } from '@/utils/serverTimeSync';

const ENABLE_MATCH_CINEMATICS = true;

function trackMatchCinematic(name: string, properties?: Record<string, unknown>) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    (supabase.from('analytics_events') as any)
      .insert({ name, properties: properties ?? null, user_id: user?.id ?? null })
      .then(() => {})
      .catch(() => {});
  });
}

const STREAK_MESSAGES: { min: number; message: string }[] = [
  { min: 3, message: '3 in a row! 🔥' },
  { min: 2, message: '2 in a row!' },
];
function getStreakMessage(streak: number): string | null {
  const m = STREAK_MESSAGES.find((s) => streak >= s.min);
  return m?.message ?? null;
}

function WaitingDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    }, delay);
    return () => clearTimeout(t);
  }, [delay, opacity]);
  return <Animated.View style={[styles.waitingDot, { opacity }]} />;
}

// Ultimate Team–style card button with sweeping shine
function TapToContinueButton({
  onPress,
  disabled,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: object;
}) {
  const shinePos = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shinePos, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shinePos]);
  const shineTranslate = shinePos.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tapToContinueButton,
        style,
        disabled && styles.tapToContinueButtonDisabled,
        pressed && styles.tapToContinueButtonPressed,
      ]}
    >
      <LinearGradient
        colors={['#f59e0b', '#d97706', '#b45309']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tapToContinueShineWrap} pointerEvents="none">
        <Animated.View
          style={[
            styles.tapToContinueShine,
            { transform: [{ translateX: shineTranslate }] },
          ]}
        />
      </View>
      <Text style={styles.tapToContinueText}>
        {disabled ? 'Checking…' : 'Tap to continue'}
      </Text>
    </Pressable>
  );
}

const CONFETTI_COLORS = ['#fef08a', '#fbbf24', '#22c55e', '#ef4444', '#3b82f6', '#a78bfa', '#fff'];
const CONFETTI_COUNT = 28;

function ResultConfetti({ visible }: { visible: boolean }) {
  const { height } = useWindowDimensions();
  const pieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100 - 10,
      delay: Math.random() * 400,
      duration: 2000 + Math.random() * 1500,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      anim: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    pieces.forEach((p) => {
      p.anim.setValue(0);
      setTimeout(() => {
        Animated.timing(p.anim, {
          toValue: 1,
          duration: p.duration,
          useNativeDriver: true,
          easing: Easing.linear,
        }).start();
      }, p.delay);
    });
  }, [visible]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p) => (
        <Animated.View
          key={p.id}
          style={[
            styles.confettiPiece,
            {
              left: `${p.x}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.size / 2,
              transform: [
                {
                  translateY: p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, height + 20],
                  }),
                },
                {
                  rotate: p.anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '720deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function VsIntroOverlay({
  playerAName,
  playerBName,
  onComplete,
}: {
  playerAName: string;
  playerBName: string;
  onComplete: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const slideY = useRef(new Animated.Value(0)).current;
  const leftNameX = useRef(new Animated.Value(-width)).current;
  const rightNameX = useRef(new Animated.Value(width)).current;
  const vsScale = useRef(new Animated.Value(0)).current;
  const vsOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      Animated.parallel([
        Animated.timing(leftNameX, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(rightNameX, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.sequence([
          Animated.delay(200),
          Animated.parallel([
            Animated.spring(vsScale, {
              toValue: 1,
              useNativeDriver: true,
              friction: 8,
              tension: 80,
            }),
            Animated.timing(vsOpacity, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start();

      const exitTimer = setTimeout(() => {
        Animated.timing(slideY, {
          toValue: -height - 100,
          duration: 450,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }).start(() => onComplete());
      }, 2000);
      return () => clearTimeout(exitTimer);
    };
    run();
  }, []);

  return (
    <Animated.View
      style={[
        styles.vsOverlayWrap,
        {
          height: height + 100,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['#0f0a1e', '#1a0a2e', '#0f0a1e']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.vsOverlayVignette} />
      <Animated.View style={[styles.vsOverlayGlow, { opacity: glowOpacity }]} />
      <View style={styles.vsOverlayContent}>
        <Animated.View style={[styles.vsNameBlock, styles.vsNameLeft, { transform: [{ translateX: leftNameX }] }]}>
          <Text style={styles.vsNameText} numberOfLines={1}>{playerAName || 'Player 1'}</Text>
          <View style={[styles.vsNameBar, styles.vsNameBarLeft]} />
        </Animated.View>
        <Animated.View style={[styles.vsVsCenter, { transform: [{ scale: vsScale }], opacity: vsOpacity }]}>
          <View style={styles.vsVsGlow} />
          <Text style={styles.vsVsText}>VS</Text>
        </Animated.View>
        <Animated.View style={[styles.vsNameBlock, styles.vsNameRight, { transform: [{ translateX: rightNameX }] }]}>
          <Text style={styles.vsNameText} numberOfLines={1}>{playerBName || 'Player 2'}</Text>
          <View style={[styles.vsNameBar, styles.vsNameBarRight]} />
        </Animated.View>
      </View>
      <Text style={styles.vsTagline}>BATTLE BEGINS</Text>
    </Animated.View>
  );
}

const ROUNDS_COUNT = 10;
const TOTAL_SECONDS = 60;
const WAITING_OPPONENT_TIMEOUT_SEC = 30;
const QUICK_MATCH_TIMEOUT_MS = 20000;
/** 1v1 is turn-based: realtime only needs to be "close", not instant. Debounce avoids overload. */
const REALTIME_DEBOUNCE_MS = 150;

type Match = {
  id: string;
  status: string;
  player_a: string;
  player_b: string | null;
  points_a: number;
  points_b: number;
  result?: { winner_id: string | null; score_a: number; score_b: number };
  rematch_requested_a?: boolean;
  rematch_requested_b?: boolean;
  rematch_match_id?: string | null;
  game_starts_at?: string | null;
  intro_started_at?: string | null;
  intro_duration_ms?: number;
  match_start_at?: string | null;
  outro_started_at?: string | null;
  outro_duration_ms?: number;
  tournament_test?: boolean;
  ready_up_flow?: boolean;
  ready_a?: boolean;
  ready_b?: boolean;
};

type Round = {
  id: string;
  match_id: string;
  question_id: string;
  a_answer: number | null;
  b_answer: number | null;
  a_time_ms: number | null;
  b_time_ms: number | null;
  a_correct: boolean | null;
  b_correct: boolean | null;
};

type Question = {
  id: string;
  prompt: string;
  answers_json: string[];
  correct_index: number;
  time_limit_ms: number;
};

type InviteePending = { inviteId: string; inviterUsername: string };

export default function MatchScreen() {
  const params = useLocalSearchParams<{ id?: string; inviteId?: string; inviteUsername?: string }>();
  const matchId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? undefined;
  const inviteIdParam = Array.isArray(params.inviteId) ? params.inviteId[0] : params.inviteId;
  const inviteUsernameParam = Array.isArray(params.inviteUsername) ? params.inviteUsername[0] : params.inviteUsername;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { level, xp, addPoints } = useXp();
  const [match, setMatch] = useState<Match | null>(null);
  const [rounds, setRounds] = useState<(Round & { question?: Question })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [timesUp, setTimesUp] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [locked, setLocked] = useState(false);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [opponentUsername, setOpponentUsername] = useState<string>('');
  const [myUsername, setMyUsername] = useState<string>('');
  const [standing, setStanding] = useState<{ wins: number; draws: number; losses: number } | null>(null);
  const [opponentStanding, setOpponentStanding] = useState<{ wins: number; draws: number; losses: number } | null>(null);
  const [headToHead, setHeadToHead] = useState<{ myWins: number; opponentWins: number } | null>(null);
  const [earnedXp, setEarnedXp] = useState(0);
  const [xpBeforeGame, setXpBeforeGame] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [streakMessage, setStreakMessage] = useState<string | null>(null);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
  const questionStartTimeRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const finalizeCalledRef = useRef(false);
  const mountedRef = useRef(true);
  const xpAwardedRef = useRef(false);
  const startScale = useRef(new Animated.Value(1)).current;
  const startGlowOpacity = useRef(new Animated.Value(0.35)).current;
  const tapToStartFlashRef = useRef(new Animated.Value(1)).current;
  const didHapticOpponentJoinedRef = useRef(false);
  const didHapticYouReDoneRef = useRef(false);
  const timeOutSubmittedRoundRef = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [lastInviteId, setLastInviteId] = useState<string | null>(null);
  const [inviteePending, setInviteePending] = useState<InviteePending | null>(null);
  const [inviteeResponding, setInviteeResponding] = useState(false);
  const [waitingOpponentSecondsLeft, setWaitingOpponentSecondsLeft] = useState<number | null>(null);
  const [leavingSession, setLeavingSession] = useState(false);
  const [rematchRequesting, setRematchRequesting] = useState(false);
  const [newGameFindingVisible, setNewGameFindingVisible] = useState(false);
  const [newGameMessage, setNewGameMessage] = useState('Finding opponent…');
  const [newGameNoMatchVisible, setNewGameNoMatchVisible] = useState(false);
  const [newGameLoading, setNewGameLoading] = useState(false);
  const newGameStopRef = useRef<(() => void) | null>(null);
  const [showVsIntro, setShowVsIntro] = useState(false);
  const [vsPlayerAName, setVsPlayerAName] = useState('');
  const [vsPlayerBName, setVsPlayerBName] = useState('');
  const vsIntroShownRef = useRef(false);
  type SyncPhase = 'vs' | '3' | '2' | '1' | 'go';
  const [syncPhase, setSyncPhase] = useState<SyncPhase | null>(null);
  const [introPlayerA, setIntroPlayerA] = useState<PlayerIntroData | null>(null);
  const [introPlayerB, setIntroPlayerB] = useState<PlayerIntroData | null>(null);
  const [resultDataReady, setResultDataReady] = useState(false);
  const introViewedTrackedRef = useRef(false);
  const outroCompletedTrackedRef = useRef(false);
  const syncTimeDiffTrackedRef = useRef(false);
  const [readyUpSending, setReadyUpSending] = useState(false);
  const [tournamentReadyTick, setTournamentReadyTick] = useState(0);
  const tournamentPollInFlightRef = useRef(false);
  const [tournamentOutroDismissed, setTournamentOutroDismissed] = useState(false);

  const userId = useRef<string | null>(null);
  const loadMatchRef = useRef(loadMatch);
  loadMatchRef.current = loadMatch;
  const opponentTimeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opponentTimeoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentTimeoutClaimedRef = useRef(false);
  const opponentTimeoutStartedRef = useRef<string | null>(null);
  const inviteChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { width, height } = useWindowDimensions();

  const syncTimer = useSynchronizedMatchTimer(
    {
      introStartedAt: match?.intro_started_at ?? null,
      introDurationMs: match?.intro_duration_ms ?? 7000,
      matchStartAt: match?.match_start_at ?? null,
    },
    {
      outroStartedAt: match?.outro_started_at ?? null,
      outroDurationMs: match?.outro_duration_ms ?? 2500,
    },
    match?.status ?? ''
  );
  const { phase, showIntro, showOutro, introSkippedDueToLatency } = syncTimer;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Flash "Tap here to start!" button when waiting for session to start
  useEffect(() => {
    if (!match?.id || rounds.length > 0) {
      tapToStartFlashRef.setValue(1);
      return;
    }
    const flash = Animated.loop(
      Animated.sequence([
        Animated.timing(tapToStartFlashRef, {
          toValue: 0.55,
          duration: 600,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(tapToStartFlashRef, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    flash.start();
    return () => flash.stop();
  }, [match?.id, rounds.length]);

  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/');
      return;
    }
    userId.current = user.id;

    const { data: matchData, error: matchErr } = await supabase
      .from('matches_1v1')
      .select('id, status, player_a, player_b, points_a, points_b, result, rematch_requested_a, rematch_requested_b, rematch_match_id, game_starts_at, intro_started_at, intro_duration_ms, match_start_at, outro_started_at, outro_duration_ms, tournament_test, ready_up_flow, ready_a, ready_b')
      .eq('id', matchId)
      .single();

    if (matchErr || !matchData) {
      if (mountedRef.current) {
        Alert.alert('Error', 'Match not found');
        router.back();
      }
      return;
    }
    if (mountedRef.current) setMatch(matchData as Match);

    // Only the session host (player_a) creates the round questions so both players get the same set.
    // Wait for player_b to join before creating rounds (invite session stays on invite form until then).
    const isHost = matchData.player_a === user.id;
    if (matchData.status === 'pending' && matchData.player_b != null) {
      const { data: roundRows } = await supabase.from('match_rounds').select('id').eq('match_id', matchId);
      if (!roundRows || roundRows.length === 0) {
        if (isHost) {
          const { data: rpcRows } = await supabase.rpc('get_random_questions', {
            p_limit: ROUNDS_COUNT,
            p_exclude_ids: [],
          });
          let ids = Array.isArray(rpcRows) ? (rpcRows as { id: string }[]).map((r) => r.id) : [];
          if (ids.length < ROUNDS_COUNT) {
            const { data: fallback } = await supabase.from('questions').select('id').eq('is_active', true).limit(100);
            const fallbackIds = (fallback ?? []).map((r) => r.id);
            const combined = [...ids, ...fallbackIds.filter((id) => !ids.includes(id))];
            ids = [...combined].sort(() => Math.random() - 0.5).slice(0, ROUNDS_COUNT);
          }
          if (ids.length >= ROUNDS_COUNT) {
            for (const qid of ids.slice(0, ROUNDS_COUNT)) {
              await supabase.from('match_rounds').insert({ match_id: matchId, question_id: qid });
            }
            if (matchData.ready_up_flow) {
              await supabase.rpc('set_match_intro_only', { p_match_id: matchId });
            } else if (ENABLE_MATCH_CINEMATICS) {
              await supabase.rpc('set_match_intro_and_start', { p_match_id: matchId });
            } else {
              const gameStartsAt = new Date(Date.now() + 4000).toISOString();
              await supabase
                .from('matches_1v1')
                .update({ status: 'in_progress', started_at: new Date().toISOString(), game_starts_at: gameStartsAt })
                .eq('id', matchId);
            }
            const { data: updatedMatch } = await supabase.from('matches_1v1').select('id, status, player_a, player_b, points_a, points_b, result, rematch_requested_a, rematch_requested_b, rematch_match_id, game_starts_at, intro_started_at, intro_duration_ms, match_start_at, outro_started_at, outro_duration_ms, tournament_test, ready_up_flow, ready_a, ready_b').eq('id', matchId).single();
            if (mountedRef.current && updatedMatch) setMatch(updatedMatch as Match);
          }
        }
      }
    }

    const { data: roundData } = await supabase
      .from('match_rounds')
      .select('id, match_id, question_id, a_answer, b_answer, a_time_ms, b_time_ms, a_correct, b_correct')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (!roundData?.length) {
      if (mountedRef.current) {
        setLoading(false);
        setRounds([]);
      }
      return;
    }

    const qIds = [...new Set(roundData.map((r) => r.question_id))];
    const { data: questionData } = await supabase
      .from('questions')
      .select('id, prompt, answers_json, correct_index, time_limit_ms')
      .in('id', qIds);

    const qMap = new Map((questionData ?? []).map((q) => [q.id, q as Question]));
    const roundsWithQ = roundData.map((r) => ({
      ...r,
      question: qMap.get(r.question_id),
    })) as (Round & { question?: Question })[];
    if (mountedRef.current) {
      setRounds(roundsWithQ);
      setLoading(false);
    }
  }, [matchId, router]);

  const debouncedRealtimeRefreshRef = useRef(
    debounce(() => {
      loadMatchRef.current?.();
    }, REALTIME_DEBOUNCE_MS)
  );

  const amA = match?.player_a === userId.current;
  const currentRoundIndexForEffect = match?.status === 'in_progress' && rounds.length
    ? rounds.findIndex((r) => (amA ? r.a_answer == null : r.b_answer == null))
    : -1;
  const myAnswersComplete = match?.status === 'in_progress' && rounds.length > 0
    && rounds.every((r) => (amA ? r.a_answer != null : r.b_answer != null));

  useEffect(() => {
    if (currentRoundIndexForEffect >= 0) {
      questionStartTimeRef.current = Date.now();
      timeOutSubmittedRoundRef.current = null;
    }
  }, [currentRoundIndexForEffect]);

  useEffect(() => {
    if (!gameStarted || !match || match.status !== 'in_progress' || !rounds.length || timesUp || myAnswersComplete) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setTimesUp(true);
          try {
            Vibration.vibrate([0, 100, 80, 100]);
          } catch {
            // Vibration not supported (e.g. simulator)
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameStarted, match?.status, rounds.length, timesUp, myAnswersComplete]);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  useEffect(() => {
    if (!match || !inviteIdParam || loading) return;
    const uid = userId.current;
    if (!uid) return;
    const amInMatch = match.player_a === uid || match.player_b === uid;
    if (amInMatch) return;
    (async () => {
      const { data: inv } = await supabase
        .from('invites')
        .select('id, to_user, from_user, status')
        .eq('id', inviteIdParam)
        .single();
      if (!mountedRef.current || !inv || inv.to_user !== uid || inv.status !== 'pending') return;
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', inv.from_user).single();
      if (mountedRef.current) {
        setInviteePending({
          inviteId: inviteIdParam,
          inviterUsername: (profile?.username as string) ?? 'Someone',
        });
      }
    })();
  }, [match?.id, inviteIdParam, loading]);

  const refreshMatch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRefreshing(true);
    loadMatch().finally(() => setRefreshing(false));
  }, [loadMatch]);

  const handleRematch = useCallback(async () => {
    if (!matchId || rematchRequesting || !match) return;
    setRematchRequesting(true);
    try {
      await supabase.rpc('request_rematch', { p_match_id: matchId });
      const { data: newId } = await supabase.rpc('create_rematch_match', { p_match_id: matchId });
      if (newId && mountedRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace(`/match/${newId}` as any);
      } else {
        loadMatchRef.current?.();
      }
    } catch {
      Alert.alert('Error', 'Could not request rematch');
    } finally {
      if (mountedRef.current) setRematchRequesting(false);
    }
  }, [matchId, match, rematchRequesting, router]);

  const handleNewGame = useCallback(async () => {
    if (newGameLoading) return;
    setNewGameLoading(true);
    setNewGameFindingVisible(true);
    setNewGameMessage('Finding opponent…');
    newGameStopRef.current = null;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    let done = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    const stopFinding = () => {
      if (done) return;
      done = true;
      realtimeChannel?.unsubscribe();
      newGameStopRef.current = null;
      setNewGameFindingVisible(false);
      setNewGameLoading(false);
    };
    newGameStopRef.current = stopFinding;

    const safetyTimeout = setTimeout(() => {
      stopFinding();
      setNewGameNoMatchVisible(true);
    }, QUICK_MATCH_TIMEOUT_MS);

    type MatchRow = { match_id: string; player_a: string; player_b: string | null };
    try {
      const { error: standingError } = await supabase.rpc('ensure_user_standing');
      if (standingError) throw new Error(standingError.message || 'Could not join matchmaking');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Sign in needed');

      const { data: enterRows, error: enterError } = await supabase.rpc('quick_match_enter', { p_user_id: user.id });
      if (enterError) throw new Error(enterError.message ?? 'Matchmaking failed');
      const row = Array.isArray(enterRows) && enterRows.length > 0 ? (enterRows[0] as MatchRow) : null;

      if (!row?.match_id) {
        stopFinding();
        clearTimeout(safetyTimeout);
        setNewGameNoMatchVisible(true);
        return;
      }

      if (row.player_b) {
        clearTimeout(safetyTimeout);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        stopFinding();
        setShowResultPopup(false);
        if (mountedRef.current) router.replace(`/match/${row.match_id}` as any);
        return;
      }

      setNewGameMessage('Waiting for opponent to join…');
      realtimeChannel = supabase
        .channel(`match:${row.match_id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches_1v1', filter: `id=eq.${row.match_id}` },
          (payload) => {
            const newRow = payload.new as { player_b: string | null };
            if (newRow?.player_b && !done) {
              clearTimeout(safetyTimeout);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              stopFinding();
              setShowResultPopup(false);
              if (mountedRef.current) router.replace(`/match/${row.match_id}` as any);
            }
          }
        )
        .subscribe();
    } catch (e: unknown) {
      stopFinding();
      clearTimeout(safetyTimeout);
      const msg = e instanceof Error ? e.message : 'Matchmaking failed';
      Alert.alert('Error', msg);
    }
  }, [newGameLoading, router]);

  const didHapticLoadRef = useRef(false);
  useEffect(() => {
    if (loading || !match) return;
    if (!didHapticLoadRef.current) {
      didHapticLoadRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [loading, match?.id]);

  useEffect(() => {
    if (match?.status === 'in_progress' && match?.player_b != null && !gameStarted && !didHapticOpponentJoinedRef.current) {
      didHapticOpponentJoinedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [match?.status, match?.player_b, gameStarted]);

  useEffect(() => {
    if (myAnswersComplete && match?.status === 'in_progress' && !didHapticYouReDoneRef.current) {
      didHapticYouReDoneRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [myAnswersComplete, match?.status]);

  useEffect(() => {
    if (gameStarted) return;
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(startScale, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(startScale, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(startGlowOpacity, { toValue: 0.65, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(startGlowOpacity, { toValue: 0.35, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    scaleLoop.start();
    glowLoop.start();
    return () => { scaleLoop.stop(); glowLoop.stop(); };
  }, [gameStarted, startScale, startGlowOpacity]);

  // Subscribe as soon as we have matchId so joiner (player 2) gets rounds/game_starts_at without waiting for first load
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_rounds',
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          debouncedRealtimeRefreshRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches_1v1',
          filter: `id=eq.${matchId}`,
        },
        () => {
          debouncedRealtimeRefreshRef.current();
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId, loadMatch]);

  // Auto-create rounds when host sees player_b joined (no tap to refresh needed)
  useEffect(() => {
    if (!match?.id || match.status !== 'pending' || match.player_b == null) return;
    const amA = match.player_a === userId.current;
    if (!amA) return;
    const t = setTimeout(() => loadMatch(), 400);
    return () => clearTimeout(t);
  }, [match?.id, match?.status, match?.player_b, match?.player_a, loadMatch]);

  // Pre-fill username when opened from profile "Invite to game" (same flow as Invite match from 1v1)
  useEffect(() => {
    if (inviteUsernameParam && typeof inviteUsernameParam === 'string') {
      try {
        setInviteUsername(decodeURIComponent(inviteUsernameParam));
      } catch {
        setInviteUsername(inviteUsernameParam);
      }
    }
  }, [inviteUsernameParam]);

  // Auto-send invite when we landed with inviteUsername param (e.g. from profile) — same RPC as tapping "Invite"
  const didAutoSendInviteRef = useRef(false);
  useEffect(() => {
    if (!matchId || !match || match.status !== 'pending' || match.player_b != null) return;
    if (match.player_a !== userId.current) return;
    if (!inviteUsernameParam || didAutoSendInviteRef.current || lastInviteId || inviteSending) return;
    let username: string;
    try {
      username = decodeURIComponent(inviteUsernameParam).trim();
    } catch {
      username = inviteUsernameParam.trim();
    }
    if (!username) return;
    didAutoSendInviteRef.current = true;
    setInviteSending(true);
    (async () => {
      try {
        const { data: inviteId, error } = await supabase.rpc('invite_by_username', {
          p_match_id: matchId,
          p_to_username: username,
        });
        if (error && mountedRef.current) {
          Alert.alert('Error', error.message || 'Could not send invite');
          didAutoSendInviteRef.current = false;
          return;
        }
        if (inviteId && mountedRef.current) {
          setLastInviteId(inviteId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      } finally {
        if (mountedRef.current) setInviteSending(false);
      }
    })();
  }, [matchId, match?.id, match?.status, match?.player_b, match?.player_a, inviteUsernameParam, lastInviteId, inviteSending]);

  useEffect(() => {
    const waiting = myAnswersComplete && match?.status === 'in_progress';
    if (!waiting || !matchId) {
      opponentTimeoutStartedRef.current = null;
      if (opponentTimeoutTimerRef.current) {
        clearTimeout(opponentTimeoutTimerRef.current);
        opponentTimeoutTimerRef.current = null;
      }
      if (opponentTimeoutIntervalRef.current) {
        clearInterval(opponentTimeoutIntervalRef.current);
        opponentTimeoutIntervalRef.current = null;
      }
      setWaitingOpponentSecondsLeft(null);
      return;
    }
    if (opponentTimeoutStartedRef.current === matchId) return;
    opponentTimeoutStartedRef.current = matchId;
    opponentTimeoutClaimedRef.current = false;
    setWaitingOpponentSecondsLeft(WAITING_OPPONENT_TIMEOUT_SEC);
    const intervalId = setInterval(() => {
      setWaitingOpponentSecondsLeft((prev) => {
        if (prev == null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    opponentTimeoutIntervalRef.current = intervalId;
    const timerId = setTimeout(() => {
      if (opponentTimeoutClaimedRef.current) return;
      opponentTimeoutClaimedRef.current = true;
      if (opponentTimeoutIntervalRef.current) {
        clearInterval(opponentTimeoutIntervalRef.current);
        opponentTimeoutIntervalRef.current = null;
      }
      opponentTimeoutTimerRef.current = null;
      supabase.rpc('finalize_1v1_opponent_timeout', { p_match_id: matchId }).then(() => {
        if (mountedRef.current) loadMatchRef.current();
      }).catch(() => {
        if (mountedRef.current) router.replace('/(tabs)' as any);
      });
    }, WAITING_OPPONENT_TIMEOUT_SEC * 1000);
    opponentTimeoutTimerRef.current = timerId;
    return () => {
      clearTimeout(timerId);
      clearInterval(intervalId);
      opponentTimeoutTimerRef.current = null;
      opponentTimeoutIntervalRef.current = null;
    };
  }, [myAnswersComplete, match?.status, matchId]);

  useEffect(() => {
    if (match?.status !== 'completed' || !match?.rematch_match_id || match.rematch_match_id === matchId) return;
    router.replace(`/match/${match.rematch_match_id}` as any);
  }, [match?.status, match?.rematch_match_id, matchId, router]);

  // Batched fetch both players' profile + W/D/L for cinematic intro/outro (as soon as both players in match)
  useEffect(() => {
    if (!match?.player_a || !match?.player_b || introPlayerA != null) return;
    if (!ENABLE_MATCH_CINEMATICS) return;
    const ids = [match.player_a, match.player_b];
    (async () => {
      const [profilesRes, standingsRes] = await Promise.all([
        supabase.from('profiles').select('id, username, avatar_url, level, country').in('id', ids),
        supabase.from('standings').select('user_id, wins, draws, losses').in('user_id', ids),
      ]);
      if (!mountedRef.current) return;
      const profiles = (profilesRes.data ?? []) as { id: string; username: string; avatar_url: string | null; level: number; country: string | null }[];
      const standings = (standingsRes.data ?? []) as { user_id: string; wins: number; draws: number; losses: number }[];
      const winsByUser = new Map<string, number>();
      const drawsByUser = new Map<string, number>();
      const lossesByUser = new Map<string, number>();
      for (const s of standings) {
        winsByUser.set(s.user_id, (winsByUser.get(s.user_id) ?? 0) + s.wins);
        drawsByUser.set(s.user_id, (drawsByUser.get(s.user_id) ?? 0) + s.draws);
        lossesByUser.set(s.user_id, (lossesByUser.get(s.user_id) ?? 0) + s.losses);
      }
      const toIntro = (userId: string, p: { username: string; avatar_url: string | null; level: number; country: string | null } | undefined): PlayerIntroData => ({
        userId,
        username: p?.username ?? 'Player',
        avatarUrl: p?.avatar_url ?? null,
        level: p?.level ?? 1,
        globalRank: null,
        countryCode: typeof p?.country === 'string' && p.country.length >= 2 ? p.country.slice(0, 2) : null,
        wins: winsByUser.get(userId) ?? 0,
        draws: drawsByUser.get(userId) ?? 0,
        losses: lossesByUser.get(userId) ?? 0,
        title: null,
      });
      const pA = profiles.find((p) => p.id === match!.player_a);
      const pB = profiles.find((p) => p.id === match!.player_b);
      setIntroPlayerA(toIntro(match.player_a, pA));
      setIntroPlayerB(toIntro(match.player_b, pB));
      setVsPlayerAName(pA?.username ?? 'Player 1');
      setVsPlayerBName(pB?.username ?? 'Player 2');
    })();
  }, [match?.player_a, match?.player_b, introPlayerA]);

  useEffect(() => {
    if (
      match?.status !== 'in_progress' ||
      !match?.player_a ||
      !match?.player_b ||
      rounds.length === 0 ||
      vsIntroShownRef.current ||
      !mountedRef.current
    ) return;
    if (ENABLE_MATCH_CINEMATICS && match?.match_start_at != null) {
      return;
    }
    // When game_starts_at is set we use sync overlay (VS + countdown); we still need names for the VS phase
    if (match?.game_starts_at) {
      (async () => {
        const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', [match.player_a, match.player_b]);
        if (!mountedRef.current) return;
        const a = profiles?.find((p) => p.id === match.player_a);
        const b = profiles?.find((p) => p.id === match.player_b);
        setVsPlayerAName((a?.username as string) ?? 'Player 1');
        setVsPlayerBName((b?.username as string) ?? 'Player 2');
      })();
      return;
    }
    vsIntroShownRef.current = true;
    (async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', [match.player_a, match.player_b]);
      if (!mountedRef.current) return;
      const a = profiles?.find((p) => p.id === match.player_a);
      const b = profiles?.find((p) => p.id === match.player_b);
      setVsPlayerAName((a?.username as string) ?? 'Player 1');
      setVsPlayerBName((b?.username as string) ?? 'Player 2');
      setShowVsIntro(true);
    })();
  }, [match?.status, match?.player_a, match?.player_b, match?.game_starts_at, match?.match_start_at, rounds.length]);

  // Sync start: drive phase from game_starts_at so both devices show VS then 3,2,1 at the same time (use server time when cinematics on)
  useEffect(() => {
    const startsAt = match?.game_starts_at;
    if (!startsAt || match?.status !== 'in_progress' || !rounds.length || gameStarted) {
      if (syncPhase !== null) setSyncPhase(null);
      return;
    }
    const t0 = new Date(startsAt).getTime();
    const tick = () => {
      if (!mountedRef.current) return;
      const now = ENABLE_MATCH_CINEMATICS ? estimatedServerTimeMs() : Date.now();
      if (now < t0) {
        setSyncPhase('vs');
        return;
      }
      if (now < t0 + 1000) {
        setSyncPhase('3');
        return;
      }
      if (now < t0 + 2000) {
        setSyncPhase('2');
        return;
      }
      if (now < t0 + 3000) {
        setSyncPhase('1');
        return;
      }
      setSyncPhase(null);
      setGameStarted(true);
      questionStartTimeRef.current = t0 + 3000;
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [match?.game_starts_at, match?.status, rounds.length, gameStarted]);

  useEffect(() => {
    if (syncPhase === '3' || syncPhase === '2' || syncPhase === '1') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, [syncPhase]);

  const currentRoundIndexForPoll = rounds.findIndex((r) => (amA ? r.a_answer == null : r.b_answer == null));
  const currentRoundForPoll = currentRoundIndexForPoll >= 0 ? rounds[currentRoundIndexForPoll] : null;
  const shouldAutoRefreshSession =
    match?.id &&
    !loading &&
    (match?.status === 'in_progress' || match?.status === 'pending') &&
    (rounds.length === 0 || !currentRoundForPoll?.question);

  // Aggressive poll when we need rounds/questions (e.g. mid-game refresh)
  useEffect(() => {
    if (!shouldAutoRefreshSession) return;
    const run = () => { if (mountedRef.current) loadMatchRef.current?.(); };
    run();
    const t1 = setTimeout(run, 80);
    const t2 = setTimeout(run, 200);
    const t3 = setTimeout(run, 350);
    const t4 = setTimeout(run, 550);
    const intervalId = setInterval(run, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearInterval(intervalId);
    };
  }, [shouldAutoRefreshSession]);

  useEffect(() => {
    if (!lastInviteId || !mountedRef.current) return;
    const ch = supabase
      .channel(`invite:${lastInviteId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invites', filter: `id=eq.${lastInviteId}` },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row?.status === 'declined' && mountedRef.current) {
            Alert.alert('Invite declined', 'Your invite has been declined.');
            setLastInviteId(null);
            loadMatchRef.current?.();
          }
        }
      )
      .subscribe();
    inviteChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      inviteChannelRef.current = null;
    };
  }, [lastInviteId]);

  const submitAnswer = useCallback(async (roundIndex: number, answerIndex: number) => {
    if (!match || !matchId || submitting) return;
    const round = rounds[roundIndex];
    if (!round?.question) return;
    const isA = match.player_a === userId.current;
    if (isA && round.a_answer != null) return;
    if (!isA && round.b_answer != null) return;

    setSubmitting(true);
    try {
      const start = questionStartTimeRef.current || Date.now();
      const timeMs = Math.max(300, Date.now() - start);
      const correct = round.question.correct_index === answerIndex;
      const timeLimitMs = round.question.time_limit_ms ?? 60000;
      const points = scoreSingleAnswer(correct, timeMs, timeLimitMs);

      const updates: Partial<Round> = isA
        ? { a_answer: answerIndex, a_time_ms: timeMs, a_correct: correct }
        : { b_answer: answerIndex, b_time_ms: timeMs, b_correct: correct };

      await supabase.from('match_rounds').update(updates).eq('id', round.id);

      const { data: m } = await supabase.from('matches_1v1').select('points_a, points_b').eq('id', matchId).single();
      const newA = isA ? (m?.points_a ?? 0) + points : (m?.points_a ?? 0);
      const newB = isA ? (m?.points_b ?? 0) : (m?.points_b ?? 0) + points;
      await supabase.from('matches_1v1').update(isA ? { points_a: newA } : { points_b: newB }).eq('id', matchId);

      await loadMatch();
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [match, matchId, submitting, rounds, loadMatch]);

  useEffect(() => {
    if (match?.status !== 'in_progress' || !rounds.length || finalizeCalledRef.current) return;
    const bothAnsweredCount = rounds.filter((r) => r.a_answer != null && r.b_answer != null).length;
    if (bothAnsweredCount < rounds.length) return;
    finalizeCalledRef.current = true;
    supabase.rpc('finalize_1v1_match', { p_match_id: matchId }).then(() => loadMatch()).catch(() => {});
  }, [match?.status, rounds, matchId, loadMatch]);

  useEffect(() => {
    if (!timesUp || currentRoundIndexForEffect < 0 || !match || timeOutSubmittedRoundRef.current === currentRoundIndexForEffect) return;
    const round = rounds[currentRoundIndexForEffect];
    if (!round?.question) return;
    const isA = match.player_a === userId.current;
    if (isA && round.a_answer != null) return;
    if (!isA && round.b_answer != null) return;
    timeOutSubmittedRoundRef.current = currentRoundIndexForEffect;
    const wrongIndex = round.question.correct_index === 0 ? 1 : 0;
    submitAnswer(currentRoundIndexForEffect, wrongIndex);
  }, [timesUp, currentRoundIndexForEffect, rounds, match, submitAnswer]);

  useEffect(() => {
    if (match?.status !== 'completed' || !match.result || !rounds.length || xpAwardedRef.current || !mountedRef.current) return;
    const amI = match.player_a === userId.current;
    const opponentId = amI ? match.player_b : match.player_a;
    if (!opponentId) return;

    (async () => {
      const { data: opp } = await supabase.from('profiles').select('username').eq('id', opponentId).single();
      if (mountedRef.current) setOpponentUsername(opp?.username ?? 'Opponent');

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: me } = await supabase.from('profiles').select('username').eq('id', user.id).single();
        if (mountedRef.current) setMyUsername(me?.username ?? 'You');
      }
      if (!user) return;
      const { data: stand } = await supabase.from('standings').select('wins, draws, losses').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (mountedRef.current) setStanding({ wins: stand?.wins ?? 0, draws: stand?.draws ?? 0, losses: stand?.losses ?? 0 });

      const { data: oppStand } = await supabase.from('standings').select('wins, draws, losses').eq('user_id', opponentId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (mountedRef.current) setOpponentStanding({ wins: oppStand?.wins ?? 0, draws: oppStand?.draws ?? 0, losses: oppStand?.losses ?? 0 });

      const { data: h2h1 } = await supabase
        .from('matches_1v1')
        .select('result')
        .eq('status', 'completed')
        .eq('player_a', user.id)
        .eq('player_b', opponentId);
      const { data: h2h2 } = await supabase
        .from('matches_1v1')
        .select('result')
        .eq('status', 'completed')
        .eq('player_a', opponentId)
        .eq('player_b', user.id);
      const allResults = [...(h2h1 ?? []), ...(h2h2 ?? [])];
      let myWins = 0;
      let opponentWins = 0;
      allResults.forEach((row: { result?: { winner_id?: string | null } | string | null }) => {
        const res = typeof row.result === 'string' ? (() => { try { return JSON.parse(row.result); } catch { return null; } })() : row.result;
        const winner = res?.winner_id ?? null;
        if (winner === user.id) myWins += 1;
        else if (winner === opponentId) opponentWins += 1;
      });
      if (mountedRef.current) setHeadToHead({ myWins, opponentWins });

      const myCorrect = rounds.filter((r) => (amI ? r.a_correct : r.b_correct) === true).length;
      const pointsFromGame = myCorrect * XP.perCorrect + (myCorrect === ROUNDS_COUNT ? XP.perfectBonus : 0);
      const won = match.result.winner_id === userId.current;
      const drew = match.result.winner_id === null;
      setXpBeforeGame(xp);
      setEarnedXp(pointsFromGame);
      xpAwardedRef.current = true;
      if (pointsFromGame > 0) {
        addPoints(pointsFromGame).then(({ leveledUp, newLevel }) => {
          if (mountedRef.current && leveledUp && newLevel != null) {
            setLevelUpNewLevel(newLevel);
            setShowLevelUpModal(true);
          }
        });
      }
      supabase.rpc('increment_profile_stats', {
        p_quizzes_delta: 1,
        p_correct_delta: myCorrect,
        p_incorrect_delta: ROUNDS_COUNT - myCorrect,
      }).then(() => {}, () => {});
      if (mountedRef.current) {
        if (won) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        else if (drew) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setResultDataReady(true);
      }
    })();
  }, [match?.status, match?.result, match?.player_a, match?.player_b, rounds.length, rounds, xp, addPoints]);

  useEffect(() => {
    if (!resultDataReady) return;
    if (ENABLE_MATCH_CINEMATICS && match?.outro_started_at != null && phase !== 'complete') return;
    if (match?.tournament_test || match?.ready_up_flow) return;
    setShowResultPopup(true);
  }, [resultDataReady, ENABLE_MATCH_CINEMATICS, match?.outro_started_at, match?.tournament_test, match?.ready_up_flow, phase]);

  useEffect(() => {
    if (!ENABLE_MATCH_CINEMATICS || !showIntro || introViewedTrackedRef.current) return;
    introViewedTrackedRef.current = true;
    trackMatchCinematic('intro_viewed');
  }, [showIntro]);

  useEffect(() => {
    if (!ENABLE_MATCH_CINEMATICS || !introSkippedDueToLatency) return;
    trackMatchCinematic('intro_skipped_due_to_latency');
  }, [introSkippedDueToLatency]);

  useEffect(() => {
    if (!ENABLE_MATCH_CINEMATICS || phase !== 'playing' || !match?.match_start_at || syncTimeDiffTrackedRef.current) return;
    syncTimeDiffTrackedRef.current = true;
    const serverNow = estimatedServerTimeMs();
    const deviceNow = Date.now();
    const diff = Math.abs(serverNow - deviceNow);
    trackMatchCinematic('match_started_sync_time_diff', { diff_ms: Math.round(diff) });
  }, [phase, match?.match_start_at]);

  useEffect(() => {
    if (!ENABLE_MATCH_CINEMATICS || phase !== 'complete' || !match?.outro_started_at || outroCompletedTrackedRef.current) return;
    outroCompletedTrackedRef.current = true;
    trackMatchCinematic('outro_completed');
  }, [phase, match?.outro_started_at]);

  const showCinematicIntro = ENABLE_MATCH_CINEMATICS && showIntro && introPlayerA != null && introPlayerB != null;
  const showCinematicOutro = ENABLE_MATCH_CINEMATICS && showOutro && match?.result && match?.outro_started_at != null;
  const useReadyUpFlow = !!(match?.ready_up_flow || match?.tournament_test);

  // Tick so Ready up button appears after 10s when using ready-up flow
  useEffect(() => {
    if (!showCinematicIntro || !useReadyUpFlow || !match?.intro_started_at) return;
    const id = setInterval(() => setTournamentReadyTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [showCinematicIntro, useReadyUpFlow, match?.intro_started_at]);

  // Poll when waiting for opponent to ready so we get match_start_at even if realtime is slow
  useEffect(() => {
    const waitingForOpponentReady =
      useReadyUpFlow &&
      (amA ? match?.ready_a : match?.ready_b) &&
      !(amA ? match?.ready_b : match?.ready_a) &&
      !match?.match_start_at &&
      matchId;
    if (!waitingForOpponentReady) return;
    const doPoll = () => {
      if (tournamentPollInFlightRef.current) return;
      tournamentPollInFlightRef.current = true;
      loadMatch().finally(() => {
        tournamentPollInFlightRef.current = false;
      });
    };
    doPoll();
    const id = setInterval(doPoll, 400);
    return () => clearInterval(id);
  }, [useReadyUpFlow, match?.ready_a, match?.ready_b, match?.match_start_at, amA, matchId, loadMatch]);

  const tournamentReadyUpUnlocked = (() => {
    if (!match?.intro_started_at) return false;
    const serverNow = estimatedServerTimeMs();
    const introStartMs = new Date(match.intro_started_at).getTime();
    return serverNow >= introStartMs + 10000;
  })();
  const amIReady = amA ? match?.ready_a : match?.ready_b;
  const opponentReady = amA ? match?.ready_b : match?.ready_a;

  if (!matchId) {
    return (
      <View style={[styles.centered, styles.matchContainer, { paddingTop: insets.top }]}>
        <Text style={styles.waitingText}>Invalid match</Text>
        <Text style={styles.waitingStatus}>This link may be broken or expired.</Text>
        <Pressable style={styles.invalidMatchBackBtn} onPress={() => router.back()}>
          <Text style={styles.invalidMatchBackText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (loading || !match) {
    return (
      <View style={[styles.centered, styles.matchContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={[styles.waitingText, { marginTop: 16 }]}>Loading match…</Text>
        <Text style={styles.waitingStatus}>Connecting to your 1v1 session</Text>
      </View>
    );
  }

  if (match.status === 'completed') {
    const amI = match.player_a === userId.current;
    const myScore = match.result?.score_a != null && match.result?.score_b != null
      ? (amI ? match.result.score_a : match.result.score_b)
      : (amI ? match.points_a : match.points_b);
    const oppScore = match.result?.score_a != null && match.result?.score_b != null
      ? (amI ? match.result.score_b : match.result.score_a)
      : (amI ? match.points_b : match.points_a);
    const winnerId = match.result?.winner_id ?? null;
    const won = winnerId === userId.current;
    const drew = winnerId === null;
    const w = standing?.wins ?? 0;
    const l = standing?.losses ?? 0;
    const d = standing?.draws ?? 0;
    const recordText = d > 0 ? `${w}-${l} (${d} draw${d !== 1 ? 's' : ''})` : `${w}-${l}`;

    const ptsNow = pointsForLevel(level);
    const xpInLevel = Math.min(ptsNow, Math.max(0, xp - xpForLevel(level)));
    const progressPct = ptsNow > 0 ? Math.min(1, xpInLevel / ptsNow) : 0;

    const showPersistentOutcomeOverlay = (match.tournament_test || match.ready_up_flow) && !tournamentOutroDismissed;

    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        {showCinematicOutro && !match.tournament_test && !match.ready_up_flow && (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 10000, elevation: 10000 }]} pointerEvents="none">
            <HeadToHeadOutro
              me={{
                userId: amA ? match.player_a : match.player_b!,
                username: myUsername || 'You',
                avatarUrl: null,
                score: myScore,
                isWinner: won,
                isDraw: drew,
              }}
              opponent={{
                userId: amA ? match.player_b! : match.player_a,
                username: opponentUsername || 'Opponent',
                avatarUrl: null,
                score: oppScore,
                isWinner: !won && !drew,
                isDraw: false,
              }}
              xpEarned={earnedXp}
              rankBefore={standing ? undefined : null}
              rankAfter={standing ? undefined : null}
              durationMs={match?.outro_duration_ms ?? 2500}
              onComplete={() => {}}
            />
          </View>
        )}
        {showPersistentOutcomeOverlay && (
          <View style={[StyleSheet.absoluteFillObject, styles.tournamentOutcomeOverlay]} pointerEvents="box-none">
            <LinearGradient
              colors={won ? ['#14532d', '#052e16', '#0a0f0a'] : drew ? ['#1e293b', '#0f172a'] : ['#7f1d1d', '#450a0a', '#0c0505']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.tournamentOutcomeContent}>
              {won && <Ionicons name="trophy" size={72} color="#fbbf24" style={styles.tournamentOutcomeIcon} />}
              <Text style={[styles.tournamentOutcomeTitle, won && styles.tournamentOutcomeTitleWin, !won && !drew && styles.tournamentOutcomeTitleLose]}>
                {match.tournament_test
                  ? (won ? 'Advance to Round of 16' : drew ? 'Draw' : 'Eliminated')
                  : (won ? 'Victory!' : drew ? 'Draw' : 'Defeat!')}
              </Text>
              <Text style={styles.tournamentOutcomeSub}>
                {match.tournament_test
                  ? (won ? 'You’re through to the next round.' : drew ? 'No winner this time.' : 'Better luck next year.')
                  : (won ? 'You won this match.' : drew ? 'No winner this time.' : 'Better luck next time.')}
              </Text>
              {won && (
                <Pressable
                  style={({ pressed }) => [styles.tournamentOutcomeShareBtn, pressed && styles.tournamentOutcomeShareBtnPressed]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    Share.share({
                      message: match.tournament_test
                        ? `I advanced to the Round of 16 in the Trivora tournament! 🏆`
                        : `I just won my 1v1 match ${myScore}-${oppScore} vs @${opponentUsername || 'opponent'} in Trivora! Can you beat me?`,
                      title: match.tournament_test ? 'Tournament advance!' : '1v1 Victory!',
                    }).catch(() => {});
                  }}
                >
                  <Ionicons name="share-social" size={22} color="#fff" />
                  <Text style={styles.tournamentOutcomeShareText}>Share</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.tournamentOutcomeOkBtn, pressed && styles.tournamentOutcomeOkBtnPressed]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setTournamentOutroDismissed(true);
                  router.replace(match.tournament_test ? '/(tabs)/modes/tournaments' : '/(tabs)' as any);
                }}
              >
                <Text style={styles.tournamentOutcomeOkText}>OK</Text>
              </Pressable>
            </View>
          </View>
        )}
        <Text style={styles.waitingText}>Match complete</Text>
        <Modal visible={showResultPopup} transparent animationType="fade">
          <Pressable style={styles.resultBackdrop} onPress={() => {}}>
            <ResultConfetti visible={!drew} />
            <View style={styles.resultModalContent}>
              <Text style={styles.resultWinnerBanner}>
                {drew ? 'Draw!' : `${won ? myUsername || 'You' : opponentUsername || 'Opponent'} wins!`}
              </Text>
              <View style={styles.resultCard}>
              <LinearGradient colors={[won ? '#22c55e' : drew ? '#64748b' : '#ef4444', won ? '#16a34a' : drew ? '#475569' : '#dc2626']} style={styles.resultGradient}>
                {won && <Ionicons name="trophy" size={48} color="#fef08a" style={{ marginBottom: 8 }} />}
                {myScore === ROUNDS_COUNT && (
                  <Text style={styles.resultPerfect}>Perfect {ROUNDS_COUNT}! 🏆</Text>
                )}
                <Text style={styles.resultOutcome}>
                  {match.tournament_test
                    ? (won ? 'Advance to Round of 16!' : drew ? 'DRAW!' : 'Eliminated')
                    : (won ? 'VICTORY!' : drew ? 'DRAW!' : 'SO CLOSE!')}
                </Text>
                <Text style={styles.resultVs}>You {myScore} – {oppScore} @{opponentUsername || 'opponent'}</Text>
                <Text style={styles.resultRecord}>Record: {recordText}</Text>
                <View style={styles.resultXpBox}>
                  <View style={styles.resultXpRow}>
                    <Text style={styles.resultXpLabel}>XP earned</Text>
                    <Text style={styles.resultXpValue}>+{earnedXp}</Text>
                  </View>
                  <View style={styles.resultLevelBarBg}>
                    <View style={[styles.resultLevelBarFill, { width: `${progressPct * 100}%` }]} />
                  </View>
                  <Text style={styles.resultLevelText}>Level {level} · {xpInLevel}/{ptsNow} XP</Text>
                </View>
                {won && (
                  <Pressable
                    style={styles.resultShareBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      Share.share({ message: `I just won my 1v1 match ${myScore}-${oppScore} vs @${opponentUsername || 'opponent'} in Trivora! Can you beat me?`, title: '1v1 Victory!' }).catch(() => {});
                    }}
                  >
                    <Ionicons name="share-social" size={20} color="#fff" />
                    <Text style={styles.resultShareText}>Share victory</Text>
                  </Pressable>
                )}
                {(amA && match.rematch_requested_b) || (!amA && match.rematch_requested_a) ? (
                  <Text style={styles.resultRematchHint}>Opponent wants a rematch!</Text>
                ) : null}
                <View style={styles.resultActions}>
                  {!match.tournament_test && (
                    <>
                      <Pressable
                        style={[styles.resultRematchBtn, rematchRequesting && styles.resultBtnDisabled]}
                        onPress={handleRematch}
                        disabled={rematchRequesting}
                      >
                        {rematchRequesting ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.resultRematchBtnText}>Rematch</Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={[styles.resultNewGameBtn, newGameLoading && styles.resultBtnDisabled]}
                        onPress={handleNewGame}
                        disabled={newGameLoading}
                      >
                        <Text style={styles.resultNewGameBtnText}>New Game</Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable
                    style={styles.resultDoneBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowResultPopup(false);
                      router.replace(match.tournament_test ? '/(tabs)/modes/tournaments' : '/(tabs)');
                    }}
                  >
                    <Text style={styles.resultDoneText}>{match.tournament_test ? 'Back to Tournaments' : 'Leave session'}</Text>
                  </Pressable>
                </View>
              </LinearGradient>
            </View>
              <View style={styles.resultAllTimeWrap}>
                <Text style={styles.resultScoreLine} numberOfLines={1}>
                  {myUsername || 'You'}  {headToHead?.myWins ?? 0}–{headToHead?.opponentWins ?? 0}  {opponentUsername || 'Opponent'}
                </Text>
              </View>
            </View>
          </Pressable>
        </Modal>
        <Modal visible={showLevelUpModal} transparent animationType="fade">
          <View style={styles.levelUpBackdrop}>
            <View style={styles.levelUpCard}>
              <Text style={styles.levelUpTitle}>Level up!</Text>
              <Text style={styles.levelUpSub}>You're now level {levelUpNewLevel}</Text>
              <Pressable
                style={styles.levelUpBtn}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  setShowLevelUpModal(false);
                }}
              >
                <Text style={styles.levelUpBtnText}>Awesome!</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal
          visible={newGameFindingVisible || newGameNoMatchVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.newGameModalBackdrop} pointerEvents="box-none">
            <View style={styles.newGameModalCard}>
              <Text style={styles.newGameModalLabel}>QUICK MATCH</Text>
              {newGameNoMatchVisible ? (
                <>
                  <Text style={styles.newGameModalTitle}>No match found</Text>
                  <Text style={styles.newGameModalSub}>Sorry we could not find you a match. Please try again.</Text>
                  <Pressable
                    style={styles.newGameModalBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setNewGameNoMatchVisible(false);
                    }}
                  >
                    <Text style={styles.newGameModalBtnText}>Try again</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color="#a78bfa" style={styles.newGameModalSpinner} />
                  <Text style={styles.newGameModalTitle}>{newGameMessage}</Text>
                  <Text style={styles.newGameModalSub}>Same 10 questions for both · 60 sec each · highest score wins</Text>
                  <Pressable
                    style={styles.newGameModalBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      newGameStopRef.current?.();
                      setNewGameFindingVisible(false);
                      setNewGameLoading(false);
                    }}
                  >
                    <Text style={styles.newGameModalBtnText}>Cancel</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  const inviteSessionHost = amA && match.player_b == null && match.status === 'pending';
  const waitingForOpponentToJoin = match.status === 'in_progress' && rounds.length > 0 && match.player_b == null && amA;
  const currentRoundIndex = rounds.findIndex((r) => (amA ? r.a_answer == null : r.b_answer == null));
  const currentRound = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
  const waitingForOpponent = myAnswersComplete && match.status === 'in_progress';

  if (waitingForOpponent) {
    const oppAnswered = rounds.filter((r) => amA ? r.b_answer != null : r.a_answer != null).length;
    const secondsLeft = waitingOpponentSecondsLeft ?? WAITING_OPPONENT_TIMEOUT_SEC;
    const handleLeaveSession = async () => {
      if (!matchId || leavingSession) return;
      setLeavingSession(true);
      try {
        await supabase.rpc('leave_1v1_match', { p_match_id: matchId });
      } catch {
        // RPC may not exist or fail; still leave so user isn't stuck
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (mountedRef.current) router.replace('/(tabs)' as any);
      setLeavingSession(false);
    };
    return (
      <View style={[styles.centered, styles.matchContainer, { paddingTop: insets.top }]}>
        <Pressable
          style={styles.waitingCard}
          onPress={refreshMatch}
          disabled={refreshing}
        >
          <Ionicons name="trophy" size={48} color="#fbbf24" style={{ marginBottom: 16 }} />
          <Text style={styles.waitingTitle}>You're done! 🎯</Text>
          <Text style={styles.waitingSub}>Waiting for your opponent to finish. Results when both are done.</Text>
          <View style={styles.waitingDots}>
            <WaitingDot delay={0} />
            <WaitingDot delay={200} />
            <WaitingDot delay={400} />
          </View>
          <Text style={styles.waitingStatus}>Opponent: {oppAnswered}/{ROUNDS_COUNT} answered</Text>
          {secondsLeft > 0 && (
            <Text style={[styles.waitingHint, { marginTop: 8 }]}>
              If they don't finish in {secondsLeft}s, you'll get the win.
            </Text>
          )}
          <TapToContinueButton onPress={refreshMatch} disabled={refreshing} style={{ marginTop: 16 }} />
          <Pressable
            style={[styles.leaveSessionButton, leavingSession && styles.leaveSessionButtonDisabled]}
            onPress={handleLeaveSession}
            disabled={leavingSession}
          >
            {leavingSession ? (
              <ActivityIndicator size="small" color="#94a3b8" />
            ) : (
              <Text style={styles.leaveSessionButtonText}>Leave session</Text>
            )}
          </Pressable>
        </Pressable>
      </View>
    );
  }

  if (inviteePending) {
    const handleInviteResponse = async (accept: boolean) => {
      if (inviteeResponding) return;
      setInviteeResponding(true);
      try {
        const { data, error } = await supabase.rpc('respond_to_invite', {
          p_invite_id: inviteePending.inviteId,
          p_accept: accept,
        });
        if (error) {
          Alert.alert('Error', error.message ?? 'Could not respond');
          return;
        }
        Haptics.notificationAsync(accept ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setInviteePending(null);
        if (accept && data?.match_id) {
          loadMatch();
        } else {
          router.replace('/(tabs)' as any);
        }
      } finally {
        if (mountedRef.current) setInviteeResponding(false);
      }
    };
    return (
      <View style={[styles.centered, styles.matchContainer, { paddingTop: insets.top }]}>
        <View style={styles.waitingCard}>
          <Ionicons name="person-add" size={48} color="#f97316" style={{ marginBottom: 16 }} />
          <Text style={styles.waitingTitle}>{inviteePending.inviterUsername} invited you to a 1v1 match</Text>
          <Text style={styles.waitingSub}>Accept to join their session and play.</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, justifyContent: 'center' }}>
            <Pressable
              style={[styles.inviteButton, { backgroundColor: '#334155', flex: 1 }]}
              onPress={() => handleInviteResponse(false)}
              disabled={inviteeResponding}
            >
              <Text style={styles.inviteButtonText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.inviteButton, { backgroundColor: '#22c55e', flex: 1 }]}
              onPress={() => handleInviteResponse(true)}
              disabled={inviteeResponding}
            >
              {inviteeResponding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.inviteButtonText}>Accept</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (inviteSessionHost) {
    const goHome = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      router.replace(match?.tournament_test ? '/(tabs)/modes/tournaments' : '/(tabs)' as any);
    };
    // Tournament test: no invite flow — second player taps "Test round" on Tournaments to join
    if (match?.tournament_test) {
      return (
        <View style={[styles.matchContainer, { paddingTop: insets.top }]}>
          <Stack.Screen
            options={{
              headerLeft: () => (
                <Pressable onPress={goHome} hitSlop={16} style={styles.inviteHeaderBack}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                  <Text style={styles.inviteBackText}>Back</Text>
                </Pressable>
              ),
            }}
          />
          <Pressable style={styles.inviteBackButton} onPress={goHome} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
            <Text style={styles.inviteBackText}>Back to Tournaments</Text>
          </Pressable>
          <View style={[styles.centered, styles.inviteSessionCardWrap]}>
            <View style={styles.waitingCard}>
              <Ionicons name="trophy" size={48} color="#fbbf24" style={{ marginBottom: 16 }} />
              <Text style={styles.waitingTitle}>Tournament test – Round of 32</Text>
              <Text style={styles.waitingSub}>
                On another phone, open Tournaments and tap "Test round". They’ll join this match and the game will start.
              </Text>
              <View style={styles.waitingDots}>
                <WaitingDot delay={0} />
                <WaitingDot delay={200} />
                <WaitingDot delay={400} />
              </View>
              <TapToContinueButton onPress={refreshMatch} disabled={refreshing} style={{ marginTop: 16 }} />
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.matchContainer, { paddingTop: insets.top }]}>
        <Stack.Screen
          options={{
            headerLeft: () => (
              <Pressable onPress={goHome} hitSlop={16} style={styles.inviteHeaderBack}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
                <Text style={styles.inviteBackText}>Back</Text>
              </Pressable>
            ),
          }}
        />
        <Pressable style={styles.inviteBackButton} onPress={goHome} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.inviteBackText}>Back</Text>
        </Pressable>
        <View style={[styles.centered, styles.inviteSessionCardWrap]}>
          <View style={styles.waitingCard}>
            {lastInviteId ? (
              <>
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" style={{ marginBottom: 16 }} />
                <Text style={styles.waitingTitle}>Invite sent. Waiting for player</Text>
                <Text style={styles.waitingSub}>
                  {inviteUsername.trim() ? `@${inviteUsername.trim()} can accept or decline in the app.` : 'They can accept or decline in the app.'}
                </Text>
                <TapToContinueButton onPress={refreshMatch} disabled={refreshing} style={{ marginTop: 16 }} />
                <Pressable
                  onPress={() => {
                    setLastInviteId(null);
                    setInviteUsername('');
                  }}
                  style={{ marginTop: 20 }}
                >
                  <Text style={styles.inviteSomeoneElseText}>Invite someone else</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name="person-add" size={48} color="#f97316" style={{ marginBottom: 16 }} />
                <Text style={styles.waitingTitle}>Invite to play</Text>
                <Text style={styles.waitingSub}>Enter their username to send an invite. They can accept or decline in the app.</Text>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Username"
                  placeholderTextColor="#94a3b8"
                  value={inviteUsername}
                  onChangeText={setInviteUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!inviteSending}
                />
                <Pressable
                  style={[styles.inviteButton, inviteSending && styles.inviteButtonDisabled]}
                  onPress={async () => {
                    const username = inviteUsername.trim();
                    if (!username || inviteSending || !matchId) return;
                    setInviteSending(true);
                    try {
                      const { data: inviteId, error } = await supabase.rpc('invite_by_username', {
                        p_match_id: matchId,
                        p_to_username: username,
                      });
                      if (error) {
                        Alert.alert('Error', error.message || 'Could not send invite');
                        return;
                      }
                      if (inviteId) setLastInviteId(inviteId);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    } finally {
                      setInviteSending(false);
                    }
                  }}
                  disabled={inviteSending || !inviteUsername.trim()}
                >
                  <Text style={styles.inviteButtonText}>{inviteSending ? 'Sending…' : 'Invite'}</Text>
                </Pressable>
                <TapToContinueButton onPress={refreshMatch} disabled={refreshing} style={{ marginTop: 20 }} />
              </>
            )}
          </View>
        </View>
      </View>
    );
  }

  if (waitingForOpponentToJoin) {
    return (
      <View style={[styles.centered, styles.matchContainer, { paddingTop: insets.top }]}>
        <View style={styles.waitingCard}>
          <Ionicons name="people" size={48} color="#f97316" style={{ marginBottom: 16 }} />
          <Text style={styles.waitingTitle}>Session ready</Text>
          <Text style={styles.waitingSub}>Waiting for an opponent to join. They’ll get the same 10 questions—first to finish wins.</Text>
          <View style={styles.waitingDots}>
            <WaitingDot delay={0} />
            <WaitingDot delay={200} />
            <WaitingDot delay={400} />
          </View>
          <TapToContinueButton onPress={refreshMatch} disabled={refreshing} style={{ marginTop: 12 }} />
        </View>
      </View>
    );
  }

  if (!currentRound?.question) {
    return (
      <View style={[styles.centered, styles.matchContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="small" color="#f97316" style={{ marginBottom: 12 }} />
        <Text style={styles.waitingText}>{rounds.length === 0 ? 'Waiting for session to start…' : 'Loading questions…'}</Text>
        <Animated.View style={{ opacity: tapToStartFlashRef, marginTop: 24, alignSelf: 'center' }}>
          <Pressable
            onPress={refreshMatch}
            disabled={refreshing}
            style={({ pressed }) => ({
              paddingVertical: 20,
              paddingHorizontal: 40,
              backgroundColor: '#eab308',
              borderRadius: 16,
              borderWidth: 3,
              borderColor: '#facc15',
              shadowColor: '#eab308',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.7,
              shadowRadius: 12,
              elevation: 10,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1c1917' }}>
              {refreshing ? 'Checking…' : 'Tap here to start!'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  const answers = Array.isArray(currentRound.question.answers_json) ? currentRound.question.answers_json : [];
  const prompt = currentRound.question.prompt ?? '';
  const timeLimitMs = currentRound.question.time_limit_ms ?? 60000;

  const showStartOverlay = !gameStarted && match.status === 'in_progress' && match.player_b != null;

  const handleAnswer = (answerIndex: number) => {
    if (locked || timesUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLocked(true);
    const correct = currentRound!.question!.correct_index === answerIndex;
    if (correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setStreakMessage(getStreakMessage(newStreak));
      setFeedback('correct');
      try {
        Vibration.vibrate(100);
      } catch {
        // ignore
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setStreak(0);
      setStreakMessage(null);
      setFeedback('wrong');
      try {
        Vibration.vibrate([0, 80, 50, 80]);
      } catch {
        // ignore
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    // Submit quickly so next question loads; clear overlay shortly after so next question appears before green/red goes off
    const submitDelay = 250;
    const clearFeedbackDelay = 350;
    setTimeout(() => {
      submitAnswer(currentRoundIndex, answerIndex);
    }, submitDelay);
    setTimeout(() => {
      setFeedback(null);
      setLocked(false);
    }, clearFeedbackDelay);
  };

  const gameContentTop = insets.top + 96; // 80px below header/back button

  return (
    <>
      {showCinematicIntro && introPlayerA && introPlayerB && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 10000, elevation: 10000 }]} pointerEvents="none">
          <HeadToHeadIntro
            playerA={introPlayerA}
            playerB={introPlayerB}
            durationMs={match?.intro_duration_ms ?? 7000}
            roundLabel={match?.tournament_test ? 'Round of 32' : undefined}
          />
        </View>
      )}
      {showCinematicIntro && useReadyUpFlow && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 10001, elevation: 10001 }]} pointerEvents="box-none">
          <View style={styles.tournamentReadyUpPanel}>
            {!tournamentReadyUpUnlocked ? (
              <Text style={styles.tournamentReadyUpWait}>
                Get ready… Starting in {Math.max(0, 10 - Math.floor((estimatedServerTimeMs() - new Date(match.intro_started_at!).getTime()) / 1000))}s
              </Text>
            ) : amIReady ? (
              <View style={styles.tournamentReadyUpWaiting}>
                <Text style={styles.tournamentReadyUpTitle}>You're ready</Text>
                <Text style={styles.tournamentReadyUpSub}>
                  {opponentReady ? 'Starting game…' : 'Waiting for opponent to ready up'}
                </Text>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.tournamentReadyUpButton, pressed && styles.tournamentReadyUpButtonPressed, readyUpSending && styles.tournamentReadyUpButtonDisabled]}
                onPress={async () => {
                  if (readyUpSending || !matchId || !userId.current) return;
                  setReadyUpSending(true);
                  try {
                    await supabase.rpc('set_tournament_ready', { p_match_id: matchId, p_user_id: userId.current });
                    const { data } = await supabase.from('matches_1v1').select('ready_a, ready_b, match_start_at, game_starts_at').eq('id', matchId).single();
                    if (mountedRef.current && data) setMatch((m) => (m ? { ...m, ...data } : m));
                  } finally {
                    if (mountedRef.current) setReadyUpSending(false);
                  }
                }}
                disabled={readyUpSending}
              >
                <Text style={styles.tournamentReadyUpButtonText}>{readyUpSending ? '…' : 'Ready up'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      {showCinematicOutro && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 10000, elevation: 10000 }]} pointerEvents="none">
          <HeadToHeadOutro
            me={{
              userId: amA ? match!.player_a : match!.player_b!,
              username: myUsername || 'You',
              avatarUrl: null,
              score: amA ? match!.points_a : match!.points_b,
              isWinner: match!.result!.winner_id === userId.current,
              isDraw: match!.result!.winner_id == null,
            }}
            opponent={{
              userId: amA ? match!.player_b! : match!.player_a,
              username: opponentUsername || 'Opponent',
              avatarUrl: null,
              score: amA ? match!.points_b : match!.points_a,
              isWinner: match!.result!.winner_id === (amA ? match!.player_b : match!.player_a),
              isDraw: false,
            }}
            xpEarned={earnedXp}
            rankBefore={standing ? undefined : null}
            rankAfter={standing ? undefined : null}
            durationMs={match?.outro_duration_ms ?? 2500}
            onComplete={() => {}}
            tournamentOutcome={match?.tournament_test ? { winner: 'Advance to Round of 16', loser: 'Eliminated' } : undefined}
          />
        </View>
      )}
      {showVsIntro && !showCinematicIntro && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
          <VsIntroOverlay
            playerAName={vsPlayerAName}
            playerBName={vsPlayerBName}
            onComplete={() => setShowVsIntro(false)}
          />
        </View>
      )}
      <View style={[styles.matchContainer, { paddingTop: gameContentTop, paddingBottom: insets.bottom }, isTablet && styles.matchContainerTablet]}>
      <View style={[styles.matchContainerInner, isTablet && { maxWidth: CONTENT_MAX_WIDTH, width: '100%' }]}>
      {!showVsIntro && !showCinematicIntro && showStartOverlay && match?.game_starts_at && (syncPhase === 'vs' || syncPhase === '3' || syncPhase === '2' || syncPhase === '1') && (
        <View style={[StyleSheet.absoluteFillObject, styles.startOverlay, { zIndex: 9998, elevation: 9998 }]} pointerEvents="none">
          <BlurView intensity={Platform.OS === 'ios' ? 60 : 80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.startBackdrop} />
          <View style={styles.startContent}>
            {syncPhase === 'vs' ? (
              <>
                <View style={styles.vsOverlayContent}>
                  <View style={[styles.vsNameBlock, styles.vsNameLeft]}>
                    <Text style={styles.vsNameText} numberOfLines={1}>{vsPlayerAName || 'Player 1'}</Text>
                    <View style={[styles.vsNameBar, styles.vsNameBarLeft]} />
                  </View>
                  <View style={[styles.vsVsCenter]}>
                    <View style={styles.vsVsGlow} />
                    <Text style={styles.vsVsText}>VS</Text>
                  </View>
                  <View style={[styles.vsNameBlock, styles.vsNameRight]}>
                    <Text style={styles.vsNameText} numberOfLines={1}>{vsPlayerBName || 'Player 2'}</Text>
                    <View style={[styles.vsNameBar, styles.vsNameBarRight]} />
                  </View>
                </View>
                <Text style={styles.vsTagline}>BATTLE BEGINS</Text>
              </>
            ) : (
              <Text style={styles.countdownNumber}>{syncPhase}</Text>
            )}
          </View>
        </View>
      )}
      {!showVsIntro && showStartOverlay && !match?.game_starts_at && (
        <View style={styles.startOverlay}>
          <BlurView intensity={Platform.OS === 'ios' ? 60 : 80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.startBackdrop} />
          <View style={styles.startContent}>
            <Text style={styles.startTitle}>Session started</Text>
            <Text style={styles.startSub}>Same 10 questions for both · 60 sec each · highest score wins</Text>
            <View style={styles.startButtonWrap}>
              <Animated.View style={[styles.startButtonGlow, { opacity: startGlowOpacity }]} pointerEvents="none" />
              <Animated.View style={[styles.startButtonAnim, { transform: [{ scale: startScale }] }]}>
                <Pressable
                  style={styles.startButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setGameStarted(true);
                    questionStartTimeRef.current = Date.now();
                  }}
                >
                  <Text style={styles.startButtonText}>Start</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </View>
      )}
      <View style={styles.topRow}>
        <View style={styles.progressRow}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${((currentRoundIndex + 1) / rounds.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{currentRoundIndex + 1} / {ROUNDS_COUNT}</Text>
        </View>
        <View style={[styles.timerPill, timeLeft <= 10 && styles.timerPillDanger]}>
          <View style={[styles.timerBar, { width: `${(timeLeft / TOTAL_SECONDS) * 100}%` }]} />
          <Text style={[styles.timerText, timeLeft <= 10 && styles.timerTextDanger]}>{timeLeft}</Text>
        </View>
      </View>
      {streakMessage && (
        <View style={styles.streakBanner}>
          <Text style={styles.streakText}>{streakMessage}</Text>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.prompt}>{prompt}</Text>
        {answers.map((text, i) => (
          <Pressable key={i} style={[styles.option, locked && styles.optionDisabled]} onPress={() => handleAnswer(i)} disabled={locked || timesUp}>
            <Text style={styles.optionText}>{text}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.scoreLine}>
        You: {amA ? match.points_a : match.points_b} pts
        {' · '}
        Opponent: {amA ? match.points_b : match.points_a} pts
        {(() => {
          const oppAnswered = rounds.filter((r) => amA ? r.b_answer != null : r.a_answer != null).length;
          return oppAnswered > 0 ? ` (${oppAnswered}/${ROUNDS_COUNT})` : '';
        })()}
      </Text>
      {feedback === 'correct' && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.greenTint} />
          <Text style={styles.feedbackText}>CORRECT</Text>
        </View>
      )}
      {feedback === 'wrong' && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.redTint} />
          <Text style={[styles.feedbackText, styles.feedbackWrong]}>WRONG</Text>
        </View>
      )}
      <View style={styles.bottomMahan} pointerEvents="none">
        <Image source={require('@/assets/Logo.png')} style={styles.bottomMahanImage} resizeMode="contain" />
      </View>
      </View>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  vsOverlayWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vsOverlayVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderTopWidth: 80,
    borderBottomWidth: 80,
    borderLeftWidth: 40,
    borderRightWidth: 40,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  vsOverlayGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  vsOverlayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  vsNameBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '38%',
  },
  vsNameLeft: { alignItems: 'flex-end' },
  vsNameRight: { alignItems: 'flex-start' },
  vsNameText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    letterSpacing: 1,
  },
  vsNameBar: {
    width: 60,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  vsNameBarLeft: { backgroundColor: '#22c55e', alignSelf: 'flex-end' },
  vsNameBarRight: { backgroundColor: '#ef4444', alignSelf: 'flex-start' },
  vsVsCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  vsVsGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  vsVsText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fbbf24',
    letterSpacing: 6,
    textShadowColor: 'rgba(251, 191, 36, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  vsTagline: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4,
    color: 'rgba(251, 191, 36, 0.7)',
    textAlign: 'center',
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: '900',
    color: '#fbbf24',
    textShadowColor: 'rgba(251, 191, 36, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  matchContainer: { flex: 1, padding: 20, backgroundColor: '#0f172a' },
  matchContainerTablet: { alignItems: 'center' },
  matchContainerInner: { flex: 1, width: '100%' },
  content: { paddingHorizontal: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  waitingText: { fontSize: 18, fontWeight: '600', color: '#94a3b8' },
  waitingCard: {
    backgroundColor: '#1e293b',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    maxWidth: 320,
    borderWidth: 2,
    borderColor: '#334155',
  },
  waitingTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8 },
  waitingSub: { fontSize: 15, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 16, marginBottom: 24 },
  inviteInput: {
    width: '100%',
    maxWidth: 260,
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  inviteButton: { backgroundColor: '#f97316', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14, alignItems: 'center' },
  inviteButtonDisabled: { opacity: 0.6 },
  inviteButtonText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  inviteBackButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  inviteHeaderBack: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, gap: 4 },
  inviteBackText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  inviteSessionCardWrap: { flex: 1 },
  waitingDots: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  waitingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#f97316' },
  confettiPiece: { position: 'absolute', top: 0 },
  waitingHint: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  inviteSomeoneElseText: { fontSize: 15, color: '#f97316', fontWeight: '600' },
  waitingStatus: { fontSize: 14, color: '#94a3b8', marginTop: 8, fontWeight: '600' },
  tournamentReadyUpPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 48,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  tournamentReadyUpWait: { fontSize: 16, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  tournamentReadyUpWaiting: { alignItems: 'center' },
  tournamentReadyUpTitle: { fontSize: 18, fontWeight: '800', color: '#22c55e', marginBottom: 4 },
  tournamentReadyUpSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  tournamentReadyUpButton: {
    backgroundColor: '#f59e0b',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
  },
  tournamentReadyUpButtonPressed: { opacity: 0.9 },
  tournamentReadyUpButtonDisabled: { opacity: 0.7 },
  tournamentReadyUpButtonText: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  tournamentOutcomeOverlay: { zIndex: 10001, elevation: 10001, justifyContent: 'center', alignItems: 'center' },
  tournamentOutcomeContent: { alignItems: 'center', paddingHorizontal: 32, maxWidth: 360 },
  tournamentOutcomeIcon: { marginBottom: 24 },
  tournamentOutcomeTitle: { fontSize: 32, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 16, lineHeight: 40 },
  tournamentOutcomeTitleWin: { color: '#fef08a', fontSize: 36, lineHeight: 44 },
  tournamentOutcomeTitleLose: { color: '#fca5a5', fontSize: 36, lineHeight: 44 },
  tournamentOutcomeSub: { fontSize: 18, color: 'rgba(248,250,252,0.9)', textAlign: 'center', marginBottom: 40 },
  tournamentOutcomeShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' },
  tournamentOutcomeShareBtnPressed: { opacity: 0.9 },
  tournamentOutcomeShareText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  tournamentOutcomeOkBtn: { backgroundColor: '#f59e0b', paddingVertical: 18, paddingHorizontal: 56, borderRadius: 16 },
  tournamentOutcomeOkBtnPressed: { opacity: 0.9 },
  tournamentOutcomeOkText: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  tapToContinueButton: {
    overflow: 'hidden',
    alignSelf: 'center',
    minWidth: 220,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
    position: 'relative',
  },
  tapToContinueButtonDisabled: { opacity: 0.85 },
  tapToContinueButtonPressed: { opacity: 0.95, transform: [{ scale: 0.98 }] },
  tapToContinueShineWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 14,
  },
  tapToContinueShine: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 60,
    left: '50%',
    marginLeft: -30,
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ skewX: '-20deg' }],
  },
  tapToContinueText: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  leaveSessionButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  leaveSessionButtonDisabled: { opacity: 0.6 },
  leaveSessionButtonText: { fontSize: 16, fontWeight: '600', color: '#94a3b8' },
  invalidMatchBackBtn: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 28, backgroundColor: '#334155', borderRadius: 12 },
  invalidMatchBackText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  startOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  startBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  startContent: { alignItems: 'center', padding: 32 },
  startTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  startSub: { fontSize: 16, color: '#94a3b8', marginBottom: 28 },
  startButtonWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  startButtonGlow: {
    position: 'absolute',
    width: 180,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#f97316',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    elevation: 12,
  },
  startButtonAnim: {},
  startButton: { paddingVertical: 18, paddingHorizontal: 56, backgroundColor: '#f97316', borderRadius: 16 },
  startButtonText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  streakBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.25)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(249, 115, 22, 0.5)',
  },
  streakText: { fontSize: 16, fontWeight: '800', color: '#fb923c' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  progressRow: { flex: 1, marginBottom: 0 },
  progressBarBg: { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: '#f97316', borderRadius: 4 },
  progressText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', fontWeight: '700' },
  timerPill: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e293b',
    borderWidth: 4,
    borderColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  timerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    backgroundColor: 'rgba(249, 115, 22, 0.35)',
  },
  timerText: { fontSize: 28, fontWeight: '900', color: '#f97316' },
  timerPillDanger: { borderColor: '#ef4444' },
  timerTextDanger: { color: '#ef4444' },
  card: { backgroundColor: '#1e293b', padding: 24, borderRadius: 20, borderWidth: 2, borderColor: '#334155' },
  prompt: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 24, lineHeight: 28 },
  option: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#334155',
    marginTop: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionDisabled: { opacity: 0.7 },
  optionText: { fontSize: 16, color: '#f8fafc', fontWeight: '500' },
  scoreLine: { fontSize: 14, color: '#94a3b8', marginTop: 16 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greenTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(34, 197, 94, 0.5)' },
  redTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(239, 68, 68, 0.45)' },
  feedbackText: { fontSize: 48, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  feedbackWrong: { color: '#fef2f2' },
  resultBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultModalContent: { alignItems: 'center', width: '100%' },
  resultWinnerBanner: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 16,
  },
  resultCard: { width: '100%', maxWidth: 340, borderRadius: 24, overflow: 'hidden' },
  resultGradient: { padding: 28, alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 24 },
  resultPerfect: { fontSize: 14, fontWeight: '800', color: '#fef08a', marginBottom: 4, letterSpacing: 0.5 },
  resultOutcome: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 12 },
  resultVs: { fontSize: 16, color: 'rgba(255,255,255,0.95)', marginBottom: 8 },
  resultRecord: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginBottom: 16 },
  resultXpBox: { width: '100%', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 14, marginBottom: 16 },
  resultXpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  resultXpLabel: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  resultXpValue: { fontSize: 18, fontWeight: '800', color: '#fef08a' },
  resultLevelBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  resultLevelBarFill: { height: '100%', backgroundColor: '#fef08a', borderRadius: 4 },
  resultLevelText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  resultShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, marginBottom: 12 },
  resultShareText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 },
  resultRematchHint: { fontSize: 14, color: '#fef08a', marginBottom: 6, textAlign: 'center', fontStyle: 'italic' },
  resultRematchBtn: { backgroundColor: '#7c3aed', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignItems: 'center', minWidth: 100 },
  resultRematchBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  resultNewGameBtn: { backgroundColor: '#16a34a', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignItems: 'center', minWidth: 100 },
  resultNewGameBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  resultBtnDisabled: { opacity: 0.6 },
  resultDoneBtn: { backgroundColor: 'rgba(255,255,255,0.9)', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, alignItems: 'center', minWidth: 100 },
  resultDoneText: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  newGameModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  newGameModalCard: {
    backgroundColor: '#1e1b4b',
    borderRadius: 20,
    padding: 32,
    minWidth: 260,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(124, 58, 237, 0.5)',
  },
  newGameModalLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: '#a78bfa', marginBottom: 12, textAlign: 'center' },
  newGameModalSpinner: { marginBottom: 16 },
  newGameModalTitle: { fontSize: 18, fontWeight: '700', color: '#e9d5ff', marginBottom: 6, textAlign: 'center' },
  newGameModalSub: { fontSize: 14, color: '#a78bfa', marginBottom: 20, textAlign: 'center' },
  newGameModalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  newGameModalBtnText: { fontSize: 16, fontWeight: '700', color: '#c4b5fd' },
  resultAllTimeWrap: {
    marginTop: 20,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resultScoreLine: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  levelUpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  levelUpCard: { backgroundColor: '#1e1b4b', padding: 32, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 320, borderWidth: 2, borderColor: '#fbbf24' },
  levelUpTitle: { fontSize: 28, fontWeight: '900', color: '#fbbf24', marginBottom: 8 },
  levelUpSub: { fontSize: 20, fontWeight: '700', color: '#e9d5ff', marginBottom: 24 },
  levelUpBtn: { paddingVertical: 14, paddingHorizontal: 40, backgroundColor: '#fbbf24', borderRadius: 14 },
  levelUpBtnText: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  bottomMahan: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 100,
    zIndex: 5,
  },
  bottomMahanImage: { width: 120, height: 82 },
});
