import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Vibration,
  Platform,
  Animated,
  Easing,
  Image,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useXp, xpForLevel, pointsForLevel, levelFromXp } from '@/lib/xp-context';

const BATCH_SIZE = 10;
const QUESTION_POOL_LIMIT = 500;
const LOAD_MORE_AT_INDEX = 3; // when questionsLeft <= this, load next batch

type Question = { id: string; prompt: string; answers_json: string[]; correct_index: number };

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const XP_PER_CORRECT = 1;

function AnimatedXpBar({
  progressStart,
  progressEnd,
  delay = 0,
}: {
  progressStart: number;
  progressEnd: number;
  delay?: number;
}) {
  const animValue = useRef(new Animated.Value(progressStart)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.timing(animValue, {
        toValue: progressEnd,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [progressEnd, delay, animValue]);
  return (
    <View style={exitStyles.xpBarTrack}>
      <Animated.View
        style={[
          exitStyles.xpBarFill,
          {
            width: animValue.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

export default function UnlimitedQuizScreen() {
  const router = useRouter();
  const { xp, level, addPoints } = useXp();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [locked, setLocked] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showExitSummary, setShowExitSummary] = useState(false);
  const [xpBeforeExit, setXpBeforeExit] = useState<number | null>(null);
  const [earnedXpExit, setEarnedXpExit] = useState(0);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
  const pointsAwardedRef = useRef(false);
  const usedIdsRef = useRef<Set<string>>(new Set());
  const startScale = useRef(new Animated.Value(1)).current;
  const startGlowOpacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (gameStarted) return;
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(startScale, {
          toValue: 1.08,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(startScale, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(startGlowOpacity, {
          toValue: 0.65,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(startGlowOpacity, {
          toValue: 0.35,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    scaleLoop.start();
    glowLoop.start();
    return () => {
      scaleLoop.stop();
      glowLoop.stop();
    };
  }, [gameStarted, startScale, startGlowOpacity]);

  const loadQuestions = useCallback(async (append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    const excludeIds = Array.from(usedIdsRef.current);

    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_random_questions', {
      p_limit: BATCH_SIZE,
      p_exclude_ids: excludeIds,
    });

    let chosen: Question[] = [];
    if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
      chosen = rpcRows.map((r: { id: string; prompt: string; answers_json: string[]; correct_index: number }) => ({
        id: r.id,
        prompt: r.prompt,
        answers_json: r.answers_json ?? [],
        correct_index: r.correct_index ?? 0,
      }));
    }

    if (chosen.length < BATCH_SIZE) {
      const { data: fallbackRows } = await supabase
        .from('questions')
        .select('id, prompt, answers_json, correct_index')
        .eq('is_active', true)
        .limit(QUESTION_POOL_LIMIT);
      const pool = shuffle((fallbackRows ?? []) as Question[]);
      const filtered = pool.filter((q) => !usedIdsRef.current.has(q.id));
      const picked = shuffle(filtered).slice(0, BATCH_SIZE - chosen.length);
      const chosenIds = new Set(chosen.map((q) => q.id));
      for (const q of picked) {
        if (!chosenIds.has(q.id)) {
          chosen.push(q);
          chosenIds.add(q.id);
        }
      }
    }

    chosen.forEach((q) => usedIdsRef.current.add(q.id));

    if (append) {
      setQuestions((prev) => [...prev, ...chosen]);
      setLoadingMore(false);
    } else {
      setQuestions(chosen);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions(false);
  }, [loadQuestions]);

  // When we're near the end of the list, load more so we never run out
  useEffect(() => {
    if (!gameStarted || loadingMore || questions.length === 0) return;
    const remaining = questions.length - (index + 1);
    if (remaining <= LOAD_MORE_AT_INDEX) {
      loadQuestions(true);
    }
  }, [gameStarted, index, questions.length, loadingMore, loadQuestions]);

  // If we've run out (index past end), wait for load more
  const waitingForMore = gameStarted && questions.length > 0 && index >= questions.length;

  // When exit summary is shown, award XP once then show progress
  useEffect(() => {
    if (!showExitSummary || earnedXpExit <= 0 || pointsAwardedRef.current) return;
    pointsAwardedRef.current = true;
    addPoints(earnedXpExit).then(({ leveledUp, newLevel }) => {
      if (leveledUp && newLevel != null) {
        setLevelUpNewLevel(newLevel);
        setTimeout(() => setShowLevelUpModal(true), 500);
      }
    });
  }, [showExitSummary, earnedXpExit, addPoints]);

  const handleBackPress = useCallback(() => {
    setXpBeforeExit(xp);
    setEarnedXpExit(correctCount * XP_PER_CORRECT);
    setShowExitSummary(true);
  }, [xp, correctCount]);

  const question = questions[index];
  const answers = question ? (Array.isArray(question.answers_json) ? question.answers_json : []) : [];

  const handleAnswer = useCallback(
    (answerIndex: number) => {
      if (!question || locked) return;
      setLocked(true);
      const correct = question.correct_index === answerIndex;
      if (correct) {
        setCorrectCount((c) => c + 1);
        setFeedback('correct');
        try {
          Vibration.vibrate(100);
        } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setFeedback('wrong');
        try {
          Vibration.vibrate([0, 80, 50, 80]);
        } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }

      const delay = correct ? 800 : 1200;
      const timer = setTimeout(() => {
        setFeedback(null);
        setLocked(false);
        setIndex((i) => i + 1);
      }, delay);
      return () => clearTimeout(timer);
    },
    [question, locked]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0e7490" />
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  if (!gameStarted && questions.length === 0) {
    return (
      <View style={[styles.centered, styles.container]}>
        <Text style={styles.noQuestions}>No questions available.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (showExitSummary) {
    const xpBefore = xpBeforeExit ?? xp;
    const earned = earnedXpExit;
    const levelStart = levelFromXp(xpBefore);
    const ptsStart = pointsForLevel(levelStart);
    const xpInLevelStart = ptsStart > 0 ? (xpBefore - xpForLevel(levelStart)) / ptsStart : 0;
    const progressStart = Math.min(1, Math.max(0, xpInLevelStart));
    const ptsNow = pointsForLevel(level);
    const xpInLevelNow = Math.min(ptsNow, Math.max(0, xp - xpForLevel(level)));
    const progressEnd = ptsNow > 0 ? Math.min(1, xpInLevelNow / ptsNow) : 0;
    const xpToNext = ptsNow - xpInLevelNow;

    return (
      <LinearGradient colors={['#1e1b4b', '#312e81']} style={exitStyles.resultWrap}>
        <View style={exitStyles.resultLevelBadge}>
          <View style={exitStyles.resultLevelBadgeInner}>
            <Ionicons name="star" size={14} color="#fbbf24" />
            <Text style={exitStyles.resultLevelText}>LVL {level}</Text>
          </View>
        </View>
        <View style={exitStyles.resultCard}>
          <View style={exitStyles.xpBox}>
            <View style={exitStyles.xpBoxLevelRow}>
              <Ionicons name="star" size={20} color="#fbbf24" />
              <Text style={exitStyles.xpBoxLevelText}>Level {level}</Text>
            </View>
            <View style={exitStyles.xpBarWrap}>
              <AnimatedXpBar progressStart={progressStart} progressEnd={progressEnd} delay={300} />
              <Text style={exitStyles.xpBarLabel}>
                {xpInLevelNow} / {ptsNow} XP
                {xpToNext > 0 ? ` · ${xpToNext} to next level` : ''}
              </Text>
            </View>
            <View style={exitStyles.xpEarnedRow}>
              <Text style={exitStyles.xpEarnedLabel}>Just earned</Text>
              <Text style={exitStyles.xpEarnedValue}>+{earned} XP</Text>
            </View>
          </View>
          <Text style={exitStyles.resultTitle}>Unlimited Quiz</Text>
          <Text style={exitStyles.resultScore}>
            {correctCount} correct · +{earned} XP
          </Text>
          <Pressable style={exitStyles.doneBtn} onPress={() => router.back()}>
            <Text style={exitStyles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
        <Modal
          visible={showLevelUpModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLevelUpModal(false)}
        >
          <View style={exitStyles.levelUpBackdrop}>
            <View style={exitStyles.levelUpCard}>
              <Text style={exitStyles.levelUpTitle}>Level up!</Text>
              <Text style={exitStyles.levelUpSub}>You're now level {levelUpNewLevel}</Text>
              <Pressable style={exitStyles.levelUpBtn} onPress={() => setShowLevelUpModal(false)}>
                <Text style={exitStyles.levelUpBtnText}>Awesome!</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    );
  }

  if (gameStarted && (question == null || waitingForMore)) {
    return (
      <View style={[styles.centered, styles.container]}>
        {loadingMore ? (
          <>
            <ActivityIndicator size="large" color="#0e7490" />
            <Text style={styles.loadingText}>Loading more questions...</Text>
          </>
        ) : (
          <>
            <Text style={styles.noQuestions}>No more questions right now.</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!gameStarted && questions.length > 0 && (
        <View style={styles.startOverlay}>
          <BlurView intensity={Platform.OS === 'ios' ? 60 : 80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.startBackdrop} />
          <View style={styles.startContent}>
            <Text style={styles.startTitle}>Unlimited Quiz Questions</Text>
            <Text style={styles.startSub}>No time limit · No question limit · Practice</Text>
            <Text style={styles.startXpText}>1XP for every correct answer!</Text>
            <View style={styles.startButtonWrap}>
              <Animated.View style={[styles.startButtonGlow, { opacity: startGlowOpacity }]} pointerEvents="none" />
              <Animated.View style={[styles.startButtonAnim, { transform: [{ scale: startScale }] }]}>
                <Pressable style={styles.startButton} onPress={() => setGameStarted(true)}>
                  <Text style={styles.startButtonText}>Start</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </View>
      )}

      {gameStarted && question && (
        <>
          <View style={styles.topRow}>
            <Pressable style={styles.backPill} onPress={handleBackPress}>
              <Ionicons name="chevron-back" size={22} color="#94a3b8" />
              <Text style={styles.backPillText}>Back</Text>
            </Pressable>
            <View style={styles.statsRow}>
              <View style={styles.statPill}>
                <Text style={styles.statPillLabel}>Correct</Text>
                <Text style={styles.statPillValue}>{correctCount}</Text>
              </View>
              <Text style={styles.questionCount}>Q {index + 1}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.prompt}>{question.prompt}</Text>
            {answers.map((text, i) => (
              <Pressable
                key={i}
                style={[styles.option, locked && styles.optionDisabled]}
                onPress={() => handleAnswer(i)}
                disabled={locked}
              >
                <Text style={styles.optionText}>{text}</Text>
              </Pressable>
            ))}
          </View>

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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#94a3b8' },
  noQuestions: { color: '#94a3b8', marginBottom: 16 },
  backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#334155', borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '600' },
  startOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  startBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  startContent: { alignItems: 'center', padding: 32 },
  startTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  startSub: { fontSize: 16, color: '#94a3b8', marginBottom: 12 },
  startXpText: { fontSize: 17, color: '#fbbf24', fontWeight: '700', marginBottom: 24 },
  startButtonWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  startButtonGlow: {
    position: 'absolute',
    width: 180,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#0e7490',
    shadowColor: '#0e7490',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 24,
    elevation: 12,
  },
  startButtonAnim: {},
  startButton: { paddingVertical: 18, paddingHorizontal: 56, backgroundColor: '#0e7490', borderRadius: 16 },
  startButtonText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderRadius: 20,
  },
  backPillText: { fontSize: 15, fontWeight: '600', color: '#94a3b8' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statPill: {
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#22c55e',
    minWidth: 80,
    alignItems: 'center',
  },
  statPillLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  statPillValue: { fontSize: 20, fontWeight: '800', color: '#22c55e' },
  questionCount: { fontSize: 14, fontWeight: '700', color: '#0e7490' },
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greenTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 197, 94, 0.5)',
  },
  redTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(239, 68, 68, 0.45)',
  },
  feedbackText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  feedbackWrong: { color: '#fef2f2' },
  bottomMahan: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 110,
    zIndex: 5,
    elevation: 5,
  },
  bottomMahanImage: { width: 140, height: 96, minWidth: 140, minHeight: 96 },
});

const exitStyles = StyleSheet.create({
  resultWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  resultLevelBadge: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  resultLevelBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30, 27, 75, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  resultLevelText: { fontSize: 16, fontWeight: '800', color: '#fbbf24' },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  xpBox: {
    width: '100%',
    backgroundColor: 'rgba(30, 27, 75, 0.8)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.5)',
  },
  xpBoxLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  xpBoxLevelText: { fontSize: 20, fontWeight: '800', color: '#fbbf24' },
  xpBarWrap: { marginBottom: 12 },
  xpBarTrack: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 6,
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#fbbf24',
    borderRadius: 6,
  },
  xpBarLabel: { fontSize: 13, fontWeight: '600', color: '#c4b5fd' },
  xpEarnedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  xpEarnedLabel: { fontSize: 14, color: '#a78bfa' },
  xpEarnedValue: { fontSize: 18, fontWeight: '800', color: '#fbbf24' },
  resultTitle: { fontSize: 22, fontWeight: '800', color: '#e9d5ff', marginBottom: 16 },
  resultScore: { fontSize: 20, fontWeight: '700', color: '#c4b5fd', marginBottom: 24 },
  doneBtn: { paddingVertical: 16, paddingHorizontal: 48, backgroundColor: '#0e7490', borderRadius: 14 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  levelUpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  levelUpCard: {
    backgroundColor: '#312e81',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  levelUpTitle: { fontSize: 28, fontWeight: '900', color: '#fbbf24', marginBottom: 8 },
  levelUpSub: { fontSize: 20, fontWeight: '700', color: '#e9d5ff', marginBottom: 24 },
  levelUpBtn: { paddingVertical: 14, paddingHorizontal: 40, backgroundColor: '#fbbf24', borderRadius: 14 },
  levelUpBtnText: { color: '#1e1b4b', fontWeight: '800', fontSize: 18 },
});
