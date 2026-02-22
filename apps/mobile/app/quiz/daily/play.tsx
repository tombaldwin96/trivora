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
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useXp, XP, xpForLevel, pointsForLevel } from '@/lib/xp-context';

const DAILY_COUNT = 10;
const QUESTION_POOL_LIMIT = 500;
const DAILY_MAX_POINTS_PER_QUESTION = 100;
const DAILY_BONUS_MS = 1000;
const DAILY_POINTS_LOST_PER_MS = 8 / 1000; // 8 points per second after 1s
const DAILY_XP_PERCENT = 0.2;

function dailyPointsForAnswer(correct: boolean, timeMs: number): number {
  if (!correct) return 0;
  if (timeMs <= DAILY_BONUS_MS) return DAILY_MAX_POINTS_PER_QUESTION;
  const overMs = timeMs - DAILY_BONUS_MS;
  const lost = overMs * DAILY_POINTS_LOST_PER_MS;
  return Math.max(0, Math.round(DAILY_MAX_POINTS_PER_QUESTION - lost));
}

type Question = { id: string; prompt: string; answers_json: string[]; correct_index: number };

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function DailyQuizPlayScreen() {
  const params = useLocalSearchParams<{ quiz_id?: string; attempt_id?: string }>();
  const router = useRouter();
  const { level, xp, addPoints } = useXp();
  const quizIdParam = Array.isArray(params.quiz_id) ? params.quiz_id[0] : params.quiz_id;
  const attemptIdParam = Array.isArray(params.attempt_id) ? params.attempt_id[0] : params.attempt_id;
  const [quizId, setQuizId] = useState<string | null>(quizIdParam ?? null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(attemptIdParam ?? null);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const questionStartTimeRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [quizIdResolved, setQuizIdResolved] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
  const [xpBeforeGame, setXpBeforeGame] = useState<number | null>(null);
  const [earnedThisGame, setEarnedThisGame] = useState(0);
  const [gameEnded, setGameEnded] = useState(false);
  const [answerChoices, setAnswerChoices] = useState<number[]>([]);
  const [showResultsReview, setShowResultsReview] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const pointsAwardedRef = useRef(false);
  const startScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (gameStarted && questions.length > 0 && index < questions.length) {
      questionStartTimeRef.current = Date.now();
    }
  }, [gameStarted, index, questions.length]);
  const startGlowOpacity = useRef(new Animated.Value(0.35)).current;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

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

  useEffect(() => {
    if (params.quiz_id) {
      setQuizId(params.quiz_id);
      setQuizIdResolved(true);
      return;
    }
    supabase.from('quizzes').select('id').eq('type', 'daily').eq('status', 'published').limit(1).maybeSingle().then(({ data }) => {
      if (data?.id) {
        setQuizId(data.id);
      }
      setQuizIdResolved(true);
    });
  }, [params.quiz_id]);

  const loadQuestions = useCallback(async () => {
    const qid = quizId ?? params.quiz_id;
    if (!qid) return;
    setLoading(true);

    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_daily_questions', {
      p_limit: DAILY_COUNT,
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

    if (chosen.length < DAILY_COUNT) {
      const { data: fallbackRows } = await supabase
        .from('questions')
        .select('id, prompt, answers_json, correct_index')
        .eq('is_active', true)
        .limit(QUESTION_POOL_LIMIT);
      const pool = shuffle((fallbackRows ?? []) as Question[]);
      const picked = pool.slice(0, DAILY_COUNT);
      const chosenIds = new Set(chosen.map((q) => q.id));
      for (const q of picked) {
        if (chosen.length >= DAILY_COUNT) break;
        if (!chosenIds.has(q.id)) {
          chosen.push(q);
          chosenIds.add(q.id);
        }
      }
    }

    setQuestions(chosen.slice(0, DAILY_COUNT));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    if (!params.attempt_id) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from('attempts')
        .select('id, ended_at')
        .eq('user_id', user.id)
        .eq('quiz_id', qid)
        .gte('started_at', today + 'T00:00:00Z')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        if (existing.ended_at) {
          setLoading(false);
          Alert.alert(
            "Already completed",
            "You've already completed today's daily quiz. Your score is on the leaderboard. Come back tomorrow for a new quiz!",
            [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
          );
          return;
        }
        setAttemptId(existing.id);
      } else {
        const { data: attempt } = await supabase
          .from('attempts')
          .insert({ user_id: user.id, quiz_id: qid, mode: 'daily', score_total: 0 })
          .select('id')
          .single();
        if (attempt) setAttemptId(attempt.id);
      }
    } else {
      setAttemptId(params.attempt_id);
    }
    setLoading(false);
  }, [quizId, params.quiz_id, params.attempt_id, router]);

  useEffect(() => {
    if (quizIdResolved && (quizId || params.quiz_id)) loadQuestions();
  }, [loadQuestions, quizIdResolved, quizId, params.quiz_id]);

  const question = questions[index];
  const answers = question ? (Array.isArray(question.answers_json) ? question.answers_json : []) : [];
  const isLast = index >= questions.length - 1;
  const gameComplete = questions.length > 0 && index >= questions.length;
  const earnedXp = Math.round(totalScore * DAILY_XP_PERCENT);

  useEffect(() => {
    if (!gameEnded || !questions.length || pointsAwardedRef.current || !attemptId) return;
    pointsAwardedRef.current = true;
    setXpBeforeGame(xp);
    setEarnedThisGame(earnedXp);
    addPoints(earnedXp).then(({ leveledUp, newLevel }) => {
      if (leveledUp && newLevel != null) {
        setLevelUpNewLevel(newLevel);
        setTimeout(() => setShowLevelUpModal(true), 400);
      }
    });
  }, [gameEnded, questions.length, totalScore, attemptId, earnedXp, addPoints, xp]);

  const handleAnswer = useCallback(
    async (answerIndex: number) => {
      if (!question || locked || submitting || !attemptId || !url) return;
      setLocked(true);
      setSubmitting(true);
      const timeMs = Math.max(0, Date.now() - questionStartTimeRef.current);
      const correct = question.correct_index === answerIndex;
      const pointsThisQuestion = dailyPointsForAnswer(correct, timeMs);
      setTotalScore((s) => s + pointsThisQuestion);
      if (correct) {
        setScore((s) => s + 1);
        setFeedback('correct');
        try { Vibration.vibrate(100); } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setFeedback('wrong');
        try { Vibration.vibrate([0, 80, 50, 80]); } catch {}
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`${url}/functions/v1/submit-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            attempt_id: attemptId,
            question_id: question.id,
            answer_index: answerIndex,
            time_ms: timeMs,
          }),
        });
      } finally {
        setSubmitting(false);
      }

      const delay = correct ? 800 : 1200;
      setTimeout(() => {
        setAnswerChoices((prev) => [...prev, answerIndex]);
        setFeedback(null);
        setLocked(false);
        setIndex((i) => i + 1);
        if (isLast) {
          setGameEnded(true);
          const finalTotal = totalScore + pointsThisQuestion;
          supabase
            .from('attempts')
            .update({ ended_at: new Date().toISOString(), score_total: finalTotal })
            .eq('id', attemptId)
            .then(() => {}, () => {});
        }
      }, delay);
    },
    [question, locked, submitting, attemptId, url, isLast]
  );

  const hasQuizId = !!(quizId ?? params.quiz_id);
  if (loading || !quizIdResolved || (!hasQuizId && quizIdResolved)) {
    if (quizIdResolved && !hasQuizId) {
      return (
        <View style={[styles.centered, styles.container]}>
          <Text style={styles.noQuestions}>No daily quiz available.</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading questions…</Text>
      </View>
    );
  }

  if (!questions.length) {
    return (
      <View style={[styles.centered, styles.container]}>
        <Text style={styles.noQuestions}>No questions available.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (gameEnded) {
    const ptsNow = pointsForLevel(level);
    const xpInLevel = Math.min(ptsNow, Math.max(0, xp - xpForLevel(level)));
    const progressEnd = ptsNow > 0 ? Math.min(1, xpInLevel / ptsNow) : 0;

    if (showResultsReview && answerChoices.length === questions.length) {
      const reviewQ = questions[reviewIndex];
      const reviewAnswers = reviewQ ? (Array.isArray(reviewQ.answers_json) ? reviewQ.answers_json : []) : [];
      const chosen = answerChoices[reviewIndex] ?? -1;
      const correctIdx = reviewQ?.correct_index ?? 0;

      return (
        <View style={styles.reviewWrap}>
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Pressable onPress={() => setShowResultsReview(false)} style={styles.reviewBackBtn}>
                <Text style={styles.reviewBackText}>← Back to summary</Text>
              </Pressable>
              <Text style={styles.reviewProgress}>
                Question {reviewIndex + 1} of {questions.length}
              </Text>
            </View>
            <Text style={styles.prompt}>{reviewQ?.prompt ?? ''}</Text>
            {reviewAnswers.map((text, i) => {
              const isCorrect = i === correctIdx;
              const isChosen = i === chosen;
              return (
                <View
                  key={i}
                  style={[
                    styles.reviewOption,
                    isCorrect && styles.reviewOptionCorrect,
                    isChosen && !isCorrect && styles.reviewOptionWrong,
                  ]}
                >
                  <Text style={[styles.reviewOptionText, isCorrect && styles.reviewOptionTextCorrect]}>
                    {text}
                  </Text>
                  {isCorrect && <Text style={styles.reviewOptionBadge}>Correct answer</Text>}
                  {isChosen && !isCorrect && <Text style={styles.reviewOptionBadgeWrong}>Your answer</Text>}
                  {isChosen && isCorrect && <Text style={styles.reviewOptionBadge}>Your answer</Text>}
                </View>
              );
            })}
            <View style={styles.reviewNav}>
              <Pressable
                style={[styles.reviewNavBtn, reviewIndex === 0 && styles.reviewNavBtnDisabled]}
                onPress={() => setReviewIndex((i) => Math.max(0, i - 1))}
                disabled={reviewIndex === 0}
              >
                <Text style={styles.reviewNavBtnText}>Previous</Text>
              </Pressable>
              <Pressable
                style={[styles.reviewNavBtn, reviewIndex >= questions.length - 1 && styles.reviewNavBtnDisabled]}
                onPress={() =>
                  reviewIndex >= questions.length - 1
                    ? setShowResultsReview(false)
                    : setReviewIndex((i) => Math.min(questions.length - 1, i + 1))
                }
              >
                <Text style={styles.reviewNavBtnText}>
                  {reviewIndex >= questions.length - 1 ? 'Back to summary' : 'Next'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.resultWrap}>
        <ScrollView
          style={styles.resultScroll}
          contentContainerStyle={styles.resultScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resultCard}>
            <View style={styles.xpBox}>
              <View style={styles.xpBoxLevelRow}>
                <Text style={styles.xpBoxLevelText}>Level {level}</Text>
              </View>
              <View style={styles.xpBarWrap}>
                <View style={styles.xpBarTrack}>
                  <View style={[styles.xpBarFill, { width: `${progressEnd * 100}%` }]} />
                </View>
                <Text style={styles.xpBarLabel}>
                  {xpInLevel} / {ptsNow} XP
                </Text>
              </View>
              <View style={styles.xpEarnedRow}>
                <Text style={styles.xpEarnedLabel}>Just earned</Text>
                <Text style={styles.xpEarnedValue}>+{earnedThisGame} XP</Text>
              </View>
            </View>
            <Text style={styles.resultTitle}>Today&apos;s Daily Quiz</Text>
            <Text style={styles.resultScore}>
              {totalScore} / 1000
            </Text>
            <Text style={styles.resultScoreSub}>{score} correct</Text>
          </View>

          <View style={styles.resultActions}>
            <View style={styles.resultActionsRow}>
              <Pressable style={styles.seeResultsBtn} onPress={() => { setReviewIndex(0); setShowResultsReview(true); }}>
                <Text style={styles.seeResultsBtnText}>See Results</Text>
              </Pressable>
              <Pressable style={styles.homeBtn} onPress={() => router.replace('/(tabs)')}>
                <Text style={styles.homeBtnText}>Home</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {showLevelUpModal && (
          <View style={styles.levelUpBackdrop}>
            <View style={styles.levelUpCard}>
              <Text style={styles.levelUpTitle}>Level up!</Text>
              <Text style={styles.levelUpSub}>You&apos;re now level {levelUpNewLevel}</Text>
              <Pressable style={styles.levelUpBtn} onPress={() => setShowLevelUpModal(false)}>
                <Text style={styles.levelUpBtnText}>Awesome!</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!gameStarted && (
        <View style={styles.startOverlay}>
          <BlurView intensity={Platform.OS === 'ios' ? 60 : 80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.startBackdrop} />
          <View style={styles.startContent}>
            <Text style={styles.startTitle}>Today&apos;s Daily Quiz</Text>
            <Text style={styles.startSub}>10 questions · No time limit</Text>
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
      <View style={styles.topRow}>
        <View style={styles.progressRow}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${((index + 1) / questions.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {index + 1} / {DAILY_COUNT}
          </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { flex: 1, padding: 20, paddingTop: 220, backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#94a3b8' },
  noQuestions: { color: '#94a3b8', marginBottom: 16 },
  backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#334155', borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '600' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  progressRow: { flex: 1, marginBottom: 0 },
  progressBarBg: { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: '#f97316', borderRadius: 4 },
  progressText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', fontWeight: '700' },
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
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  greenTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(34, 197, 94, 0.5)' },
  redTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(239, 68, 68, 0.45)' },
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
  resultWrap: { flex: 1, backgroundColor: '#1e1b4b' },
  reviewWrap: {
    flex: 1,
    backgroundColor: '#1e1b4b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultScroll: { flex: 1 },
  resultScrollContent: { flexGrow: 1, padding: 24, paddingBottom: 48, alignItems: 'center', justifyContent: 'center' },
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
  xpBarFill: { height: '100%', backgroundColor: '#fbbf24', borderRadius: 6 },
  xpBarLabel: { fontSize: 13, fontWeight: '600', color: '#c4b5fd' },
  xpEarnedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  xpEarnedLabel: { fontSize: 14, color: '#a78bfa' },
  xpEarnedValue: { fontSize: 18, fontWeight: '800', color: '#fbbf24' },
  resultTitle: { fontSize: 22, fontWeight: '800', color: '#e9d5ff', marginBottom: 16 },
  resultScore: { fontSize: 56, fontWeight: '900', color: '#fff', marginBottom: 4 },
  resultScoreSub: { fontSize: 16, color: '#94a3b8', marginBottom: 12 },
  resultActions: { marginTop: 24, alignItems: 'center', width: '100%' },
  resultActionsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 12, alignItems: 'center', justifyContent: 'center' },
  seeResultsBtn: {
    paddingVertical: 16,
    paddingHorizontal: 28,
    backgroundColor: '#334155',
    borderRadius: 14,
    minWidth: 140,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#475569',
  },
  seeResultsBtnText: { fontSize: 16, color: '#e2e8f0', fontWeight: '700' },
  homeBtn: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    backgroundColor: '#f97316',
    borderRadius: 14,
    minWidth: 160,
    alignItems: 'center',
  },
  homeBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  reviewCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 24,
    borderRadius: 24,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  reviewBackBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  reviewBackText: { fontSize: 15, color: '#a78bfa', fontWeight: '600' },
  reviewProgress: { fontSize: 14, color: '#94a3b8', fontWeight: '600' },
  reviewOption: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#334155',
    marginTop: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reviewOptionCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderColor: '#22c55e',
  },
  reviewOptionWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  reviewOptionText: { fontSize: 16, color: '#f8fafc', fontWeight: '500' },
  reviewOptionTextCorrect: { color: '#f8fafc' },
  reviewOptionBadge: { fontSize: 12, color: '#22c55e', fontWeight: '700', marginTop: 6 },
  reviewOptionBadgeWrong: { fontSize: 12, color: '#ef4444', fontWeight: '700', marginTop: 6 },
  reviewNav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, gap: 12 },
  reviewNavBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#475569',
    borderRadius: 12,
  },
  reviewNavBtnDisabled: { opacity: 0.5 },
  reviewNavBtnText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  levelUpBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 20,
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
