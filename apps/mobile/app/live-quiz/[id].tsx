import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  useWindowDimensions,
  Animated,
  Image,
  Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio, Video } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLiveQuizState, useLiveQuizPack, submitLiveQuizAnswer, getLiveQuizQuestionPodium, type LiveQuizQuestion, type PodiumEntry } from '@/lib/live-quiz-state';
import { syncServerTime, estimatedServerTimeMs, msUntilServerTimestamp } from '@/utils/serverTimeSync';
import { supabase } from '@/lib/supabase';

const SIREN_SOUND_URI = 'https://assets.mixkit.co/active_storage/sfx/2570-siren-whistle-alert.mp3';

async function playSirenSound() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentMode: true, staysActiveInBackground: false, shouldDuck: false, playThroughEarpieceAndroid: false });
    const { sound } = await Audio.Sound.createAsync({ uri: SIREN_SOUND_URI }, { shouldPlay: true, volume: 0.8 });
    sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinishAndNotStop) sound.unloadAsync(); });
  } catch {}
}

function countryToFlag(country: string | null | undefined): string {
  if (!country || typeof country !== 'string') return '';
  const s = country.trim().toUpperCase();
  if (s.length !== 2) return '';
  return String.fromCodePoint(...[...s].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)));
}

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function LiveQuizSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = Array.isArray(params.id) ? params.id[0] : params.id ?? null;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { state, leaderboard, loading: stateLoading } = useLiveQuizState(sessionId);
  const { questions, loading: packLoading, refetchPack } = useLiveQuizPack(sessionId);

  const [countdownSecs, setCountdownSecs] = useState<number | null>(null);
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaderboardModal, setLeaderboardModal] = useState(false);
  const [podiumEntries, setPodiumEntries] = useState<PodiumEntry[]>([]);
  const [showPodiumModal, setShowPodiumModal] = useState(false);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myTotalScore, setMyTotalScore] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const questionStartRef = useRef<number>(0);
  const lastResetQuestionKeyRef = useRef<string>('');
  const lastPodiumQuestionIdRef = useRef<string>('');
  const podiumDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shuffledOrderRef = useRef<Record<string, number[]>>({});
  const lastSirenPlayedAtRef = useRef<string | null>(null);
  const showIncorrectForQuestionRef = useRef<string | null>(null);
  const lastMahanSweepAtRef = useRef<string | null>(null);
  const mahanSweepAnimRef = useRef(new Animated.Value(0));
  const [forceStandingsVisible, setForceStandingsVisible] = useState(false);
  const [showMahanSweep, setShowMahanSweep] = useState(false);

  useEffect(() => {
    const until = state?.show_leaderboard_until;
    if (!until) {
      setForceStandingsVisible(false);
      return;
    }
    const untilMs = new Date(until).getTime();
    if (untilMs <= Date.now()) {
      setForceStandingsVisible(false);
      return;
    }
    setForceStandingsVisible(true);
    const t = setInterval(() => {
      if (new Date(until).getTime() <= Date.now()) setForceStandingsVisible(false);
    }, 1000);
    return () => clearInterval(t);
  }, [state?.show_leaderboard_until]);

  const currentQuestion: LiveQuizQuestion | null = state != null && questions.length > 0
    ? (questions.find((q) => q.position === state.current_question_index)
        ?? questions[state.current_question_index]
        ?? null)
    : null;

  const displayOrder = currentQuestion
    ? (() => {
        const id = currentQuestion.id;
        if (!shuffledOrderRef.current[id]) {
          shuffledOrderRef.current[id] = shuffleIndices(currentQuestion.options.length);
        }
        return shuffledOrderRef.current[id];
      })()
    : [];
  const displayOptions = currentQuestion ? displayOrder.map((i) => currentQuestion.options[i]) : [];
  const displayCorrectIndex = currentQuestion && displayOrder.length > 0 ? displayOrder.indexOf(currentQuestion.correct_index) : 0;

  const isOpen = state?.phase === 'open';
  const isReveal = state?.phase === 'reveal';
  const isEnded = state?.phase === 'ended';
  const isCountdown = state?.phase === 'countdown';
  const isLocked = state?.phase === 'locked';

  useEffect(() => {
    if (!sessionId) return;
    syncServerTime().catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    const at = state?.siren_played_at ?? null;
    if (!at || at === lastSirenPlayedAtRef.current) return;
    lastSirenPlayedAtRef.current = at;
    playSirenSound();
  }, [state?.siren_played_at]);

  useEffect(() => {
    const at = state?.mahan_sweep_at ?? null;
    if (!at || at === lastMahanSweepAtRef.current) return;
    lastMahanSweepAtRef.current = at;
    setShowMahanSweep(true);
  }, [state?.mahan_sweep_at]);

  useEffect(() => {
    if (!showMahanSweep || width <= 0) return;
    mahanSweepAnimRef.current.setValue(0);
    Animated.timing(mahanSweepAnimRef.current, {
      toValue: 1,
      duration: 3200,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.ease),
    }).start(({ finished }) => {
      if (finished) setShowMahanSweep(false);
    });
  }, [showMahanSweep, width]);

  const didRefetchForOpen = useRef(false);
  useEffect(() => {
    if (state?.phase !== 'open') {
      didRefetchForOpen.current = false;
      return;
    }
    if (sessionId && questions.length === 0 && !didRefetchForOpen.current) {
      didRefetchForOpen.current = true;
      refetchPack();
    }
  }, [state?.phase, sessionId, questions.length, refetchPack]);

  useEffect(() => {
    if (!state?.countdown_ends_at || state.phase !== 'countdown') {
      setCountdownSecs(null);
      return;
    }
    const tick = () => {
      const ms = msUntilServerTimestamp(state.countdown_ends_at!);
      setCountdownSecs(ms <= 0 ? 0 : Math.ceil(ms / 1000));
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [state?.phase, state?.countdown_ends_at]);

  useEffect(() => {
    if (!state?.question_started_at || state.phase !== 'open' || !currentQuestion) {
      setQuestionTimeLeft(null);
      return;
    }
    const duration = state.question_duration_ms ?? currentQuestion.time_limit_ms ?? 15000;
    const tick = () => {
      const elapsed = estimatedServerTimeMs() - new Date(state.question_started_at!).getTime();
      const left = Math.max(0, duration - elapsed);
      setQuestionTimeLeft(left <= 0 ? 0 : Math.ceil(left / 1000));
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [state?.phase, state?.question_started_at, state?.question_duration_ms, currentQuestion?.id]);

  const handleAnswer = useCallback(async (displayIndex: number) => {
    if (!sessionId || !currentQuestion || selectedAnswer != null || state?.phase !== 'open') return;
    const originalIndex = displayOrder[displayIndex] ?? displayIndex;
    setSubmitError(null);
    setSelectedAnswer(displayIndex);
    const elapsed = Math.round(Date.now() - questionStartRef.current);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const result = await submitLiveQuizAnswer(sessionId, currentQuestion.id, originalIndex, elapsed);
      setSubmitted(true);
      const score = typeof result.score_awarded === 'number' ? result.score_awarded : 0;
      setLastScore(score);
      if (score === 0 && currentQuestion?.id) showIncorrectForQuestionRef.current = currentQuestion.id;
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed');
    }
  }, [sessionId, currentQuestion, selectedAnswer, state?.phase, displayOrder]);

  useEffect(() => {
    if (state?.phase !== 'open' || !state?.question_started_at) return;
    const questionKey = `${state.current_question_index}-${state.question_started_at}`;
    if (lastResetQuestionKeyRef.current === questionKey) return;
    lastResetQuestionKeyRef.current = questionKey;
    questionStartRef.current = new Date(state.question_started_at).getTime();
    showIncorrectForQuestionRef.current = null;
    setSelectedAnswer(null);
    setSubmitted(false);
    setLastScore(null);
    setSubmitError(null);
  }, [state?.phase, state?.question_started_at, state?.current_question_index]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId || leaderboard.length === 0) return;
    const idx = leaderboard.findIndex((e) => e.user_id === userId);
    setMyRank(idx >= 0 ? leaderboard[idx].rank : null);
  }, [userId, leaderboard]);

  useEffect(() => {
    if (!sessionId || !userId || !state) return;
    const fetchMyScore = async () => {
      const { data } = await supabase
        .from('live_quiz_scores')
        .select('total_score')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();
      const score = (data as { total_score?: number } | null)?.total_score;
      setMyTotalScore(typeof score === 'number' ? score : null);
    };
    fetchMyScore();
    const t = setInterval(fetchMyScore, 3000);
    return () => clearInterval(t);
  }, [sessionId, userId, state]);

  useEffect(() => {
    if (state?.phase !== 'reveal' || !sessionId || !currentQuestion?.id) return;
    if (lastPodiumQuestionIdRef.current === currentQuestion.id) return;
    lastPodiumQuestionIdRef.current = currentQuestion.id;
    if (podiumDismissTimerRef.current) {
      clearTimeout(podiumDismissTimerRef.current);
      podiumDismissTimerRef.current = null;
    }
    getLiveQuizQuestionPodium(sessionId, currentQuestion.id).then(({ entries }) => {
      setPodiumEntries(entries);
      setShowPodiumModal(entries.length > 0);
      if (entries.length > 0) {
        podiumDismissTimerRef.current = setTimeout(() => {
          setShowPodiumModal(false);
          podiumDismissTimerRef.current = null;
        }, 6000);
      }
    });
    return () => {
      if (podiumDismissTimerRef.current) {
        clearTimeout(podiumDismissTimerRef.current);
      }
    };
  }, [state?.phase, sessionId, currentQuestion?.id]);

  if (!sessionId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Pressable style={[styles.backButton, { top: insets.top + 8 }]} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.placeholder}>Missing session.</Text>
      </View>
    );
  }

  if (stateLoading || (state == null && packLoading)) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Pressable style={[styles.backButton, { top: insets.top + 8 }]} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <ActivityIndicator size="large" color="#a78bfa" />
      </View>
    );
  }

  if (state == null) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.placeholder}>Session unavailable. Pull down or go back and tap the session again.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const videoUrl = state?.video_stream_url?.trim();
  const videoHeight = Math.min(width * 0.5, height * 0.22) + 100;
  const leaderboardHeight = 112;

  const mahanTranslateX = mahanSweepAnimRef.current.interpolate({
    inputRange: [0, 0.35, 0.5, 1],
    outputRange: [-120, width / 2 - 60, width / 2 - 60, width + 120],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Mahan sweep overlay (triggered by admin) — on viewers' screens only */}
      {showMahanSweep && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="none">
          <Animated.View
            style={[
              styles.mahanSweepWrap,
              {
                transform: [{ translateX: mahanTranslateX }],
              },
            ]}
          >
            <Image source={require('@/assets/mahan.png')} style={styles.mahanSweepImage} resizeMode="contain" />
          </Animated.View>
        </View>
      )}
      <Pressable
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={24} color="#fff" />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
      {/* ─── SECTION 1: Live stream (top) ─── */}
      <View style={[styles.sectionVideo, { height: videoHeight }]}>
        {videoUrl ? (
          <Video
            source={{ uri: videoUrl }}
            style={StyleSheet.absoluteFill}
            useNativeControls
            resizeMode="contain"
            shouldPlay
            isLooping
            onError={(e) => {
              const err = (e as { error?: string })?.error ?? 'Stream failed to load';
              console.warn('Live stream error:', err);
            }}
          />
        ) : (
          <LinearGradient colors={['#1e1b4b', '#312e81']} style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <Text style={styles.sectionLabel}>
          {videoUrl ? 'LIVE STREAM' : 'LIVE STREAM — Set URL in admin'}
        </Text>
      </View>

      {/* Countdown overlay (bottom half only; video stays visible) */}
      {isCountdown && countdownSecs != null && countdownSecs > 0 && (
        <View style={styles.countdownOverlayContainer} pointerEvents="none">
          <LinearGradient colors={['rgba(30,27,75,0.95)', 'rgba(49,46,129,0.95)']} style={styles.countdownOverlay}>
            <Text style={styles.countdownNumber}>{countdownSecs}</Text>
            <Text style={styles.countdownLabel}>Until quiz starts</Text>
          </LinearGradient>
        </View>
      )}

      {/* ─── SECTION 2: Leaderboard (compact strip) ─── */}
      <View style={[styles.sectionLeaderboard, { height: leaderboardHeight }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setLeaderboardModal(true)}>
          <View style={styles.leaderboardPreviewHeader}>
            <Ionicons name="podium" size={20} color="#a78bfa" />
            <Text style={styles.leaderboardPreviewTitle}>Leaderboard</Text>
            {(myRank != null || myTotalScore != null) && (() => {
              const scoreFromLeaderboard = userId != null && leaderboard.length > 0 ? (leaderboard.find((e) => e.user_id === userId)?.total_score ?? null) : null;
              const displayScore = typeof scoreFromLeaderboard === 'number' ? scoreFromLeaderboard : myTotalScore;
              const parts = [];
              if (myRank != null) parts.push(`You #${myRank}`);
              if (displayScore != null) parts.push(`${displayScore} pts`);
              return parts.length > 0 ? <Text style={styles.myRank}>{parts.join(' · ')}</Text> : null;
            })()}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leaderboardRow}>
            {leaderboard.slice(0, 3).map((e) => (
              <View key={e.user_id} style={styles.leaderboardItem}>
                <Text style={styles.leaderboardRank}>#{e.rank}</Text>
                <View style={styles.leaderboardNameBlock}>
                  <Text style={styles.leaderboardName} numberOfLines={1}>{e.username ?? '—'}</Text>
                  {countryToFlag(e.country) ? <Text style={styles.leaderboardFlag}>{countryToFlag(e.country)}</Text> : null}
                  <Text style={styles.leaderboardLevel}>Lv.{e.level ?? 1}</Text>
                  <Text style={styles.leaderboardRankBadge}>#{e.rank}</Text>
                </View>
                <Text style={styles.leaderboardScore}>{e.total_score} pts</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.leaderboardTap}>Tap for full leaderboard</Text>
        </Pressable>
      </View>

      {/* Divider between leaderboard and question */}
      <View style={styles.sectionDivider} />

      {/* ─── SECTION 3: Question + answers (main, largest) ─── */}
      <View style={styles.sectionQuestion}>
        {state?.phase === 'idle' && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>Live Quiz</Text>
            <Text style={styles.phaseSub}>Waiting to start. Stay tuned.</Text>
          </View>
        )}

        {isCountdown && countdownSecs === 0 && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>Get ready!</Text>
            <Text style={styles.phaseSub}>Quiz starting soon. Wait for the host to start.</Text>
          </View>
        )}

        {state?.phase === 'intermission' && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>Next question…</Text>
            <Text style={styles.phaseSub}>Get ready!</Text>
          </View>
        )}

        {isEnded && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseTitle}>{state?.message ?? 'Thanks for playing!'}</Text>
            <Pressable style={styles.leaderboardFullBtn} onPress={() => setLeaderboardModal(true)}>
              <Text style={styles.leaderboardFullBtnText}>View final leaderboard</Text>
            </Pressable>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          </View>
        )}

        {(isOpen || isLocked) && currentQuestion && (
          <>
            <Text style={styles.sectionLabelQuestion}>QUESTION</Text>
            <View style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionPrompt} numberOfLines={3}>{currentQuestion.prompt}</Text>
              {questionTimeLeft != null && isOpen && (
                <View style={[styles.timerBadge, questionTimeLeft <= 5 && styles.timerBadgeLow]}>
                  <Text style={styles.timerText}>{questionTimeLeft}s</Text>
                </View>
              )}
            </View>
            <View style={styles.answersGrid}>
              {displayOptions.map((opt, idx) => {
                const chosen = selectedAnswer === idx;
                const correct = displayCorrectIndex === idx;
                const showCorrect = isReveal && correct;
                const showWrong = isReveal && chosen && !correct;
                return (
                  <Pressable
                    key={idx}
                    style={[
                      styles.answerBtn,
                      chosen && !isReveal && styles.answerBtnSelected,
                      showCorrect && styles.answerBtnCorrect,
                      showWrong && styles.answerBtnWrong,
                    ]}
                    onPress={() => handleAnswer(idx)}
                    disabled={selectedAnswer != null || !isOpen}
                  >
                    <Text style={[styles.answerText, showCorrect && styles.answerTextCorrect, showWrong && styles.answerTextWrong]} numberOfLines={2}>{opt}</Text>
                    {showCorrect && <Ionicons name="checkmark-circle" size={22} color="#22c55e" />}
                    {showWrong && <Ionicons name="close-circle" size={22} color="#ef4444" />}
                  </Pressable>
                );
              })}
            </View>
            {isOpen && selectedAnswer == null && !submitError && <Text style={styles.hint}>Tap an answer — it locks in immediately (no Submit button)</Text>}
            {submitError && <Text style={styles.submitError}>{submitError}</Text>}
            {(lastScore === 0 || (currentQuestion?.id && showIncorrectForQuestionRef.current === currentQuestion.id)) && (selectedAnswer != null || state?.phase === 'reveal') && (
              <Text style={styles.pointsIncorrect}>Incorrect — no points this time</Text>
            )}
            {isLocked && <Text style={styles.lockedHint}>Answers locked — waiting for reveal</Text>}
            </View>
          </>
        )}

        {isReveal && currentQuestion && (
          <>
            <Text style={styles.sectionLabelQuestion}>QUESTION</Text>
            <View style={styles.questionCard}>
            <Text style={styles.questionPrompt} numberOfLines={3}>{currentQuestion.prompt}</Text>
            <View style={styles.answersGrid}>
              {displayOptions.map((opt, idx) => {
                const correct = displayCorrectIndex === idx;
                return (
                  <View key={idx} style={[styles.answerBtn, correct && styles.answerBtnCorrect]}>
                    <Text style={[styles.answerText, correct && styles.answerTextCorrect]} numberOfLines={2}>{opt}</Text>
                    {correct && <Ionicons name="checkmark-circle" size={22} color="#22c55e" />}
                  </View>
                );
              })}
            </View>
            {lastScore != null && lastScore > 0 && <Text style={styles.pointsEarned}>+{lastScore} pts</Text>}
            {(lastScore === 0 || (currentQuestion?.id && showIncorrectForQuestionRef.current === currentQuestion.id)) && (
              <Text style={styles.pointsIncorrect}>Incorrect — no points this time</Text>
            )}
            </View>
          </>
        )}

        {state?.phase === 'open' && !currentQuestion && questions.length === 0 && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseSub}>Loading questions…</Text>
          </View>
        )}

        {state?.phase === 'open' && !currentQuestion && questions.length > 0 && (
          <View style={styles.phaseCard}>
            <Text style={styles.phaseSub}>No question at index {state?.current_question_index ?? 0}. Pull down to refresh.</Text>
          </View>
        )}
      </View>

      {/* Full leaderboard bottom sheet */}
      <Modal visible={leaderboardModal} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setLeaderboardModal(false)}>
          <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Leaderboard</Text>
            <ScrollView style={styles.modalScroll}>
              {leaderboard.map((e) => (
                <View key={e.user_id} style={styles.modalRow}>
                  <Text style={styles.modalRank}>#{e.rank}</Text>
                  <View style={styles.modalNameBlock}>
                    <Text style={styles.modalName} numberOfLines={1}>{e.username ?? '—'}</Text>
                    {countryToFlag(e.country) ? <Text style={styles.modalFlag}>{countryToFlag(e.country)}</Text> : null}
                    <Text style={styles.modalLevel}>Lv.{e.level ?? 1}</Text>
                    <Text style={styles.modalRankBadge}>#{e.rank}</Text>
                  </View>
                  <Text style={styles.modalScore}>{e.total_score} pts</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setLeaderboardModal(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Forced standings overlay (admin triggered — shown on everyone's app) */}
      <Modal visible={forceStandingsVisible} animationType="fade" statusBarTranslucent>
        <View style={[styles.forcedStandingsScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Text style={styles.forcedStandingsTitle}>Standings</Text>
          <ScrollView style={styles.forcedStandingsScroll} contentContainerStyle={styles.forcedStandingsScrollContent} showsVerticalScrollIndicator>
            {leaderboard.length === 0 ? (
              <Text style={styles.forcedStandingsEmpty}>No scores yet.</Text>
            ) : (
              leaderboard.slice(0, 30).map((e) => (
                <View key={e.user_id} style={styles.forcedStandingsRow}>
                  <Text style={styles.forcedStandingsRank}>#{e.rank}</Text>
                  <Text style={styles.forcedStandingsName} numberOfLines={1}>{e.username ?? '—'}</Text>
                  {countryToFlag(e.country) ? <Text style={styles.forcedStandingsFlag}>{countryToFlag(e.country)}</Text> : null}
                  <Text style={styles.forcedStandingsScore}>{e.total_score} pts</Text>
                </View>
              ))
            )}
          </ScrollView>
          <Text style={styles.forcedStandingsHint}>Host will hide when ready</Text>
        </View>
      </Modal>

      {/* Post-reveal podium: top 3 on last question */}
      <Modal visible={showPodiumModal} transparent animationType="fade">
        <Pressable style={styles.podiumBackdrop} onPress={() => { setShowPodiumModal(false); if (podiumDismissTimerRef.current) { clearTimeout(podiumDismissTimerRef.current); podiumDismissTimerRef.current = null; } }}>
          <Pressable style={styles.podiumCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.podiumTitle}>Top 3 this question</Text>
            {podiumEntries.map((e) => (
              <View key={e.user_id} style={styles.podiumRow}>
                <Text style={styles.podiumRank}>#{e.rank}</Text>
                <Text style={styles.podiumName} numberOfLines={1}>{e.username ?? '—'}</Text>
                <Text style={styles.podiumTime}>{(e.elapsed_ms / 1000).toFixed(2)}s</Text>
                <Text style={styles.podiumPts}>+{e.score_awarded} pts</Text>
              </View>
            ))}
            <Text style={styles.podiumTapHint}>Tap anywhere to close</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  placeholder: { color: '#94a3b8', fontSize: 14 },
  mahanSweepWrap: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -60,
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mahanSweepImage: { width: 120, height: 120 },
  backButton: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    paddingRight: 14,
    borderRadius: 10,
    gap: 2,
  },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backBtn: { marginTop: 12, paddingVertical: 8 },
  backBtnText: { color: '#94a3b8', fontSize: 14 },
  /* Section 1: Live stream */
  sectionVideo: { width: '100%', backgroundColor: '#000', position: 'relative' },
  sectionLabel: { position: 'absolute', bottom: 6, left: 10, fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  liveBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  countdownOverlayContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  countdownOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  countdownNumber: { fontSize: 72, fontWeight: '800', color: '#fef08a' },
  countdownLabel: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  /* Section 2: Leaderboard strip */
  sectionLeaderboard: { width: '100%', backgroundColor: 'rgba(30,27,75,0.85)', borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.25)', paddingVertical: 10, paddingHorizontal: 14 },
  leaderboardPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  leaderboardPreviewTitle: { fontSize: 14, fontWeight: '600', color: '#c4b5fd' },
  myRank: { marginLeft: 'auto', fontSize: 13, color: '#a78bfa' },
  leaderboardRow: { gap: 14, paddingRight: 20 },
  leaderboardItem: { minWidth: 88, alignItems: 'center' },
  leaderboardRank: { fontSize: 12, color: '#94a3b8' },
  leaderboardNameBlock: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
  leaderboardName: { fontSize: 13, color: '#e2e8f0', fontWeight: '600' },
  leaderboardFlag: { fontSize: 14 },
  leaderboardLevel: { fontSize: 10, color: '#a78bfa' },
  leaderboardRankBadge: { fontSize: 10, color: '#94a3b8' },
  leaderboardScore: { fontSize: 13, color: '#a78bfa', fontWeight: '700' },
  leaderboardTap: { fontSize: 11, color: '#64748b', marginTop: 6 },
  sectionDivider: { height: 0, backgroundColor: 'rgba(167,139,250,0.2)', width: '100%' },
  /* Section 3: Question + answers (main) */
  sectionQuestion: { flex: 1, padding: 8, justifyContent: 'center', minHeight: 200 },
  sectionLabelQuestion: { fontSize: 10, fontWeight: '700', color: 'rgba(167,139,250,0.5)', letterSpacing: 0.5, marginBottom: 8 },
  phaseCard: { backgroundColor: 'rgba(30,27,75,0.8)', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  phaseTitle: { fontSize: 20, fontWeight: '700', color: '#e2e8f0', marginBottom: 8, textAlign: 'center' },
  phaseSub: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
  leaderboardFullBtn: { marginTop: 16, backgroundColor: '#7c3aed', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  leaderboardFullBtnText: { color: '#fff', fontWeight: '700' },
  forcedStandingsScreen: { flex: 1, backgroundColor: '#0f0f23' },
  forcedStandingsTitle: { fontSize: 24, fontWeight: '800', color: '#e2e8f0', textAlign: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.3)' },
  forcedStandingsScroll: { flex: 1 },
  forcedStandingsScrollContent: { padding: 16, paddingBottom: 24 },
  forcedStandingsEmpty: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginTop: 32 },
  forcedStandingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.2)', gap: 10 },
  forcedStandingsRank: { fontSize: 16, fontWeight: '700', color: '#94a3b8', minWidth: 40 },
  forcedStandingsName: { flex: 1, fontSize: 17, fontWeight: '600', color: '#e2e8f0' },
  forcedStandingsFlag: { fontSize: 18 },
  forcedStandingsScore: { fontSize: 17, fontWeight: '700', color: '#a78bfa' },
  forcedStandingsHint: { fontSize: 12, color: '#64748b', textAlign: 'center', paddingVertical: 12 },
  questionCard: { backgroundColor: 'rgba(30,27,75,0.8)', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' },
  questionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  questionPrompt: { flex: 1, fontSize: 18, fontWeight: '700', color: '#e2e8f0', lineHeight: 24 },
  timerBadge: { backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  timerBadgeLow: { backgroundColor: '#dc2626' },
  timerText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  answersGrid: { gap: 10 },
  answerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(51,65,85,0.8)', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  answerBtnSelected: { borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.2)' },
  answerBtnCorrect: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)' },
  answerBtnWrong: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.2)' },
  answerText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#e2e8f0' },
  answerTextCorrect: { color: '#22c55e' },
  answerTextWrong: { color: '#ef4444' },
  hint: { marginTop: 8, fontSize: 12, color: '#64748b', textAlign: 'center' },
  submitError: { marginTop: 8, fontSize: 13, color: '#ef4444', textAlign: 'center' },
  lockedHint: { marginTop: 8, fontSize: 14, color: '#f59e0b', textAlign: 'center' },
  pointsEarned: { marginTop: 12, fontSize: 18, fontWeight: '800', color: '#22c55e', textAlign: 'center' },
  pointsIncorrect: { marginTop: 12, fontSize: 14, color: '#94a3b8', textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1e1b4b', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#e2e8f0', marginBottom: 12 },
  modalScroll: { maxHeight: 400 },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.2)' },
  modalRank: { width: 36, fontSize: 14, color: '#94a3b8' },
  modalNameBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  modalName: { fontSize: 16, color: '#e2e8f0', flexShrink: 1 },
  modalFlag: { fontSize: 16 },
  modalLevel: { fontSize: 12, color: '#a78bfa' },
  modalRankBadge: { fontSize: 12, color: '#94a3b8' },
  modalScore: { fontSize: 14, fontWeight: '700', color: '#a78bfa', marginLeft: 8 },
  modalClose: { marginTop: 16, backgroundColor: '#334155', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalCloseText: { color: '#e2e8f0', fontWeight: '600' },
  /* Podium overlay */
  podiumBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  podiumCard: { backgroundColor: '#1e1b4b', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  podiumTitle: { fontSize: 18, fontWeight: '700', color: '#c4b5fd', marginBottom: 16, textAlign: 'center' },
  podiumRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.15)' },
  podiumRank: { width: 36, fontSize: 16, fontWeight: '800', color: '#a78bfa' },
  podiumName: { flex: 1, fontSize: 16, color: '#e2e8f0', marginRight: 8 },
  podiumTime: { fontSize: 13, color: '#94a3b8', marginRight: 10 },
  podiumPts: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  podiumTapHint: { marginTop: 12, fontSize: 11, color: '#64748b', textAlign: 'center' },
});
