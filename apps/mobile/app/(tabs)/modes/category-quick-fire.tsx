/**
 * Shared 50-sec · 10 questions game for category modes (History 10, Geography 10, etc.).
 * Same theme and behaviour as Quick Fire 10; questions are filtered by category (and optional sub_category).
 */
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
  useWindowDimensions,
  Share,
  Image,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useXp, XP, xpForLevel, pointsForLevel, levelFromXp } from '@/lib/xp-context';

const COIN_SOUND_URI = 'https://assets.mixkit.co/active_storage/sfx/1998.mp3';
const QUICK_FIRE_COUNT = 10;
const TOTAL_SECONDS = 60;
const RECENT_IDS_MAX = 50;
const QUESTION_POOL_LIMIT = 500;

type Question = { id: string; prompt: string; answers_json: string[]; correct_index: number };

async function playCoinCelebration() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentMode: true, staysActiveInBackground: false, shouldDuck: false, playThroughEarpieceAndroid: false });
    const { sound } = await Audio.Sound.createAsync({ uri: COIN_SOUND_URI }, { shouldPlay: true, volume: 0.9 });
    sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinishAndNotStop) sound.unloadAsync(); });
  } catch {}
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 80);
  } catch {}
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function getRecentQuestionIds(key: string): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function addRecentQuestionIds(key: string, ids: string[]): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    const arr = (raw ? (JSON.parse(raw) as string[]) : []) as string[];
    if (!Array.isArray(arr)) return;
    const combined = [...arr, ...ids];
    const trimmed = combined.slice(-RECENT_IDS_MAX);
    await SecureStore.setItemAsync(key, JSON.stringify(trimmed));
  } catch {}
}

function pickTenWithLoadBalance(pool: Question[], recentIds: Set<string>): Question[] {
  const notRecent = pool.filter((q) => !recentIds.has(q.id));
  const recent = pool.filter((q) => recentIds.has(q.id));
  return shuffle([...shuffle(notRecent), ...shuffle(recent)]).slice(0, QUICK_FIRE_COUNT);
}

const SCORE_MESSAGES: { min: number; message: string }[] = [
  { min: 10, message: "Perfect 10! You're unstoppable! 🏆" },
  { min: 9, message: "So close to perfection! Brilliant! ⭐" },
  { min: 8, message: "On fire! You know your stuff! 🔥" },
  { min: 7, message: "Solid! You're in the zone! 💪" },
  { min: 6, message: "Not bad at all! Keep going! 👍" },
  { min: 5, message: "Half and half. Room to grow! 📚" },
  { min: 4, message: "Could be worse. Try again! 😅" },
  { min: 3, message: "Oof. The quiz won this round. 😬" },
  { min: 2, message: "Rough run. Next time! 🤞" },
  { min: 1, message: "At least you got one! 😂" },
  { min: 0, message: "Zero? Really? Go read a book. 📖" },
];

function getScoreMessage(score: number): string {
  const found = SCORE_MESSAGES.find((s) => score >= s.min);
  return found?.message ?? SCORE_MESSAGES[SCORE_MESSAGES.length - 1].message;
}

function AnimatedXpBar({ progressStart, progressEnd, delay = 0 }: { progressStart: number; progressEnd: number; delay?: number }) {
  const animValue = useRef(new Animated.Value(progressStart)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.timing(animValue, { toValue: progressEnd, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [progressEnd, delay]);
  return (
    <View style={styles.xpBarTrack}>
      <Animated.View style={[styles.xpBarFill, { width: animValue.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

function FlyingCoin({ index, centerX, startY, endY, stagger, duration }: { index: number; centerX: number; startY: number; endY: number; stagger: number; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: endY - startY, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: duration * 0.7, useNativeDriver: true }),
      ]).start();
    }, index * stagger);
    return () => clearTimeout(t);
  }, []);
  const offsetX = (index % 5 - 2) * 16;
  return (
    <Animated.View pointerEvents="none" style={[styles.flyingCoin, { left: centerX - 14 + offsetX, top: startY, opacity, transform: [{ translateY }] }]}>
      <View style={styles.coinCircle} />
    </Animated.View>
  );
}

const COIN_COUNT_MAX = 12;
const FLY_DURATION = 700;
const FLY_STAGGER = 60;

export type CategoryQuickFireConfig = {
  modeTitle: string;
  categorySlug: string;
  subCategory?: string | null;
  recentIdsKey: string;
};

export default function CategoryQuickFireScreen({ modeTitle, categorySlug, subCategory, recentIdsKey }: CategoryQuickFireConfig) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { level, xp, addPoints } = useXp();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [locked, setLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [timesUp, setTimesUp] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showWowPopup, setShowWowPopup] = useState(false);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [levelUpNewLevel, setLevelUpNewLevel] = useState(1);
  const [xpBeforeGame, setXpBeforeGame] = useState<number | null>(null);
  const [earnedThisGame, setEarnedThisGame] = useState(0);
  const pointsAwardedRef = useRef(false);
  const startScale = useRef(new Animated.Value(1)).current;
  const startGlowOpacity = useRef(new Animated.Value(0.35)).current;

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    const recentIds = await getRecentQuestionIds(recentIdsKey);
    const excludeIds = Array.from(recentIds);

    const { data: rpcRows, error: rpcError } = await supabase.rpc('get_random_questions_by_category', {
      p_limit: QUICK_FIRE_COUNT,
      p_exclude_ids: excludeIds,
      p_category_slug: categorySlug,
      p_sub_category: subCategory ?? null,
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

    if (chosen.length < QUICK_FIRE_COUNT) {
      const { data: catData } = await supabase.from('categories').select('id').eq('slug', categorySlug.toLowerCase()).eq('is_active', true).maybeSingle();
      const categoryId = (catData as { id?: string } | null)?.id;
      if (categoryId) {
        let query = supabase.from('questions').select('id, prompt, answers_json, correct_index').eq('is_active', true).eq('category_id', categoryId).limit(QUESTION_POOL_LIMIT);
        if (subCategory?.trim()) {
          query = query.ilike('sub_category', '%' + subCategory.trim() + '%');
        }
        const { data: fallbackRows } = await query;
        const pool = shuffle((fallbackRows ?? []) as Question[]);
        const picked = pickTenWithLoadBalance(pool, recentIds);
        const chosenIds = new Set(chosen.map((q) => q.id));
        for (const q of picked) {
          if (chosen.length >= QUICK_FIRE_COUNT) break;
          if (!chosenIds.has(q.id)) { chosen.push(q); chosenIds.add(q.id); }
        }
      }
    }

    if (!chosen.length) {
      setLoading(false);
      return;
    }
    const final = chosen.slice(0, QUICK_FIRE_COUNT);
    setQuestions(final);
    addRecentQuestionIds(recentIdsKey, final.map((q) => q.id));
    setLoading(false);
  }, [categorySlug, subCategory, recentIdsKey]);

  const handleTryAgain = useCallback(() => {
    pointsAwardedRef.current = false;
    setTimesUp(false);
    setGameStarted(false);
    setIndex(0);
    setScore(0);
    setTimeLeft(TOTAL_SECONDS);
    setFeedback(null);
    setLocked(false);
    setXpBeforeGame(null);
    setEarnedThisGame(0);
    setShowWowPopup(false);
    setShowLevelUpModal(false);
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (!gameStarted) return;
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

  const gameOver = questions.length > 0 && index >= questions.length;
  const gameEnded = (questions.length > 0 && index >= questions.length) || timesUp;
  const pointsFromGame = score * XP.perCorrect + (score === QUICK_FIRE_COUNT ? XP.perfectBonus : 0);
  const coinCount = Math.min(score, COIN_COUNT_MAX);

  useEffect(() => {
    if (!gameEnded || !questions.length || pointsAwardedRef.current) return;
    pointsAwardedRef.current = true;
    setXpBeforeGame(xp);
    setEarnedThisGame(pointsFromGame);
    if (score === QUICK_FIRE_COUNT) setShowWowPopup(true);
    playCoinCelebration();
    const incorrect = questions.length - score;
    supabase.rpc('increment_profile_stats', { p_quizzes_delta: 1, p_correct_delta: score, p_incorrect_delta: incorrect }).then(() => {}, () => {});
    addPoints(pointsFromGame).then(({ leveledUp, newLevel }) => {
      if (leveledUp) {
        setLevelUpNewLevel(newLevel);
        const t = setTimeout(() => setShowLevelUpModal(true), FLY_DURATION + coinCount * FLY_STAGGER + 400);
        return () => clearTimeout(t);
      }
    });
  }, [gameEnded, questions.length, score, pointsFromGame, addPoints, coinCount, xp]);

  useEffect(() => {
    if (!showWowPopup) return;
    const t = setTimeout(() => setShowWowPopup(false), 2200);
    return () => clearTimeout(t);
  }, [showWowPopup]);

  const gameComplete = questions.length > 0 && index >= questions.length;
  useEffect(() => {
    if (!gameStarted || !questions.length || timesUp || gameComplete) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setTimesUp(true);
          try { Vibration.vibrate([0, 100, 80, 100]); } catch {}
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [gameStarted, questions.length, timesUp, gameComplete]);

  const question = questions[index];
  const answers = question ? (Array.isArray(question.answers_json) ? question.answers_json : []) : [];
  const isLast = index >= questions.length - 1;

  const handleAnswer = useCallback(
    (answerIndex: number) => {
      if (!question || locked) return;
      setLocked(true);
      const correct = question.correct_index === answerIndex;
      if (correct) {
        setScore((s) => s + 1);
        setFeedback('correct');
        try { Vibration.vibrate(100); } catch {}
      } else {
        setFeedback('wrong');
        try { Vibration.vibrate([0, 80, 50, 80]); } catch {}
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
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  if (!questions.length) {
    return (
      <View style={[styles.centered, styles.container]}>
        <Text style={styles.noQuestions}>No questions available for this category.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (gameEnded) {
    const message = getScoreMessage(score);
    const centerX = width / 2;
    const startY = height * 0.55;
    const endY = 72;
    const ptsNow = pointsForLevel(level);
    const xpInLevel = Math.min(ptsNow, Math.max(0, xp - xpForLevel(level)));
    const progressEnd = ptsNow > 0 ? Math.min(1, xpInLevel / ptsNow) : 0;
    const progressStart = xpBeforeGame != null
      ? (() => {
          const lStart = levelFromXp(xpBeforeGame);
          const ptsStart = pointsForLevel(lStart);
          return ptsStart > 0 ? Math.min(1, (xpBeforeGame - xpForLevel(lStart)) / ptsStart) : 0;
        })()
      : 0;
    const xpToNext = ptsNow - xpInLevel;

    return (
      <LinearGradient colors={['#1e1b4b', '#312e81']} style={styles.resultWrap}>
        <View style={styles.resultLevelBadge} collapsable={false}>
          <View style={styles.resultLevelBadgeInner}>
            <Ionicons name="star" size={14} color="#fbbf24" />
            <Text style={styles.resultLevelText}>LVL {level}</Text>
          </View>
        </View>
        {showWowPopup && (
          <View style={styles.wowOverlay} pointerEvents="none">
            <Text style={styles.wowTitle}>WOW! 10/10</Text>
            <Text style={styles.wowSub}>+{XP.perfectBonus} extra points!</Text>
          </View>
        )}
        <View style={styles.resultCard}>
          <View style={styles.xpBox}>
            <View style={styles.xpBoxLevelRow}>
              <Ionicons name="star" size={20} color="#fbbf24" />
              <Text style={styles.xpBoxLevelText}>Level {level}</Text>
            </View>
            <View style={styles.xpBarWrap}>
              <AnimatedXpBar progressStart={progressStart} progressEnd={progressEnd} delay={300} />
              <Text style={styles.xpBarLabel}>
                {xpInLevel} / {ptsNow} XP
                {xpToNext > 0 ? ` · ${xpToNext} to next level` : ''}
              </Text>
            </View>
            <View style={styles.xpEarnedRow}>
              <Text style={styles.xpEarnedLabel}>Just earned</Text>
              <Text style={styles.xpEarnedValue}>+{earnedThisGame} XP</Text>
            </View>
          </View>
          <Text style={styles.resultTitle}>{modeTitle}</Text>
          {timesUp && <Text style={styles.resultTimesUp}>Time's up!</Text>}
          <Text style={styles.resultScore}>{score} / {QUICK_FIRE_COUNT}</Text>
          <Text style={styles.resultMessage}>{message}</Text>
          {score === QUICK_FIRE_COUNT && (
            <Pressable
              style={styles.shareTile}
              onPress={() => Share.share({ message: `I scored 10/10 on ${modeTitle} in Trivora! Can you beat my score?`, title: `${modeTitle} - Perfect score!` }).catch(() => {})}
            >
              <Ionicons name="share-social" size={22} color="#fbbf24" />
              <Text style={styles.shareTileText}>You scored 10/10! Share this result.</Text>
            </Pressable>
          )}
          <Pressable style={styles.playAgainBtn} onPress={() => { handleTryAgain(); router.back(); }}>
            <Text style={styles.playAgainText}>Done</Text>
          </Pressable>
        </View>
        {Array.from({ length: coinCount }).map((_, i) => (
          <FlyingCoin key={i} index={i} centerX={centerX} startY={startY} endY={endY} stagger={FLY_STAGGER} duration={FLY_DURATION} />
        ))}
        <Modal visible={showLevelUpModal} transparent animationType="fade" onRequestClose={() => setShowLevelUpModal(false)}>
          <View style={styles.levelUpBackdrop}>
            <View style={styles.levelUpCard}>
              <Text style={styles.levelUpTitle}>Level up!</Text>
              <Text style={styles.levelUpSub}>You're now level {levelUpNewLevel}</Text>
              <Pressable style={styles.levelUpBtn} onPress={() => setShowLevelUpModal(false)}>
                <Text style={styles.levelUpBtnText}>Awesome!</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    );
  }

  if (timesUp && questions.length > 0) {
    return (
      <View style={[styles.container, styles.timesUpWrap]}>
        <View style={styles.timesUpTint} />
        <View style={styles.timesUpContent}>
          <Text style={styles.timesUpTitle}>Time's up!</Text>
          <Text style={styles.timesUpSub}>{score} / {QUICK_FIRE_COUNT}</Text>
          <Pressable style={styles.tryAgainBtn} onPress={handleTryAgain}>
            <Text style={styles.tryAgainText}>Try again</Text>
          </Pressable>
        </View>
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
            <Text style={styles.startTitle}>{modeTitle}</Text>
            <Text style={styles.startSub}>60 seconds · 10 questions</Text>
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
          <Text style={styles.progressText}>{index + 1} / {QUICK_FIRE_COUNT}</Text>
        </View>
        <View style={[styles.timerPill, timeLeft <= 10 && styles.timerPillDanger]}>
          <View style={[styles.timerBar, { width: `${(timeLeft / TOTAL_SECONDS) * 100}%` }]} />
          <Text style={[styles.timerText, timeLeft <= 10 && styles.timerTextPulse]}>{timeLeft}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.prompt}>{question?.prompt ?? ''}</Text>
        {answers.map((text, i) => (
          <Pressable key={i} style={[styles.option, locked && styles.optionDisabled]} onPress={() => handleAnswer(i)} disabled={locked || timesUp}>
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
  container: { flex: 1, padding: 20, backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#94a3b8' },
  noQuestions: { color: '#94a3b8', marginBottom: 16 },
  backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#334155', borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '600' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  progressRow: { flex: 1, marginBottom: 0 },
  progressBarBg: { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: '#f97316', borderRadius: 4 },
  progressText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', fontWeight: '700' },
  timerPill: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1e293b', borderWidth: 4, borderColor: '#f97316', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  timerBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%', backgroundColor: 'rgba(249, 115, 22, 0.35)' },
  timerText: { fontSize: 28, fontWeight: '900', color: '#f97316' },
  timerPillDanger: { borderColor: '#ef4444' },
  timerTextPulse: { color: '#ef4444' },
  timesUpWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  timesUpTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(185, 28, 28, 0.85)' },
  timesUpContent: { alignItems: 'center', padding: 24 },
  timesUpTitle: { fontSize: 42, fontWeight: '900', color: '#fff', marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  timesUpSub: { fontSize: 24, fontWeight: '800', color: '#fecaca', marginBottom: 32 },
  tryAgainBtn: { paddingVertical: 16, paddingHorizontal: 40, backgroundColor: '#fff', borderRadius: 14 },
  tryAgainText: { color: '#b91c1c', fontWeight: '700', fontSize: 18 },
  startOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  startBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  startContent: { alignItems: 'center', padding: 32 },
  startTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  startSub: { fontSize: 16, color: '#94a3b8', marginBottom: 28 },
  startButtonWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  startButtonGlow: { position: 'absolute', width: 180, height: 64, borderRadius: 20, backgroundColor: '#f97316', shadowColor: '#f97316', shadowOffset: { width: 0, height: 0 }, shadowRadius: 24, elevation: 12 },
  startButtonAnim: {},
  startButton: { paddingVertical: 18, paddingHorizontal: 56, backgroundColor: '#f97316', borderRadius: 16 },
  startButtonText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  card: { backgroundColor: '#1e293b', padding: 24, borderRadius: 20, borderWidth: 2, borderColor: '#334155' },
  prompt: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 24, lineHeight: 28 },
  option: { padding: 18, borderRadius: 14, backgroundColor: '#334155', marginTop: 12, borderWidth: 2, borderColor: 'transparent' },
  optionDisabled: { opacity: 0.7 },
  optionText: { fontSize: 16, color: '#f8fafc', fontWeight: '500' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  greenTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(34, 197, 94, 0.5)' },
  redTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(239, 68, 68, 0.45)' },
  feedbackText: { fontSize: 48, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  feedbackWrong: { color: '#fef2f2' },
  bottomMahan: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end', height: 110, zIndex: 5, elevation: 5 },
  bottomMahanImage: { width: 140, height: 96, minWidth: 140, minHeight: 96 },
  resultWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  resultLevelBadge: { position: 'absolute', top: 52, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  resultLevelBadgeInner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(30, 27, 75, 0.95)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 2, borderColor: '#fbbf24' },
  resultLevelText: { fontSize: 16, fontWeight: '800', color: '#fbbf24' },
  wowOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10 },
  wowTitle: { fontSize: 38, fontWeight: '900', color: '#fbbf24', marginBottom: 8 },
  wowSub: { fontSize: 20, fontWeight: '700', color: '#fff' },
  resultCard: { backgroundColor: 'rgba(255,255,255,0.1)', padding: 32, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 340 },
  xpBox: { width: '100%', backgroundColor: 'rgba(30, 27, 75, 0.8)', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 2, borderColor: 'rgba(251, 191, 36, 0.5)' },
  xpBoxLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  xpBoxLevelText: { fontSize: 20, fontWeight: '800', color: '#fbbf24' },
  xpBarWrap: { marginBottom: 12 },
  xpBarTrack: { height: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 },
  xpBarFill: { height: '100%', backgroundColor: '#fbbf24', borderRadius: 6 },
  xpBarLabel: { fontSize: 13, fontWeight: '600', color: '#c4b5fd' },
  xpEarnedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  xpEarnedLabel: { fontSize: 14, color: '#a78bfa' },
  xpEarnedValue: { fontSize: 18, fontWeight: '800', color: '#fbbf24' },
  resultTitle: { fontSize: 22, fontWeight: '800', color: '#e9d5ff', marginBottom: 16 },
  resultTimesUp: { fontSize: 18, fontWeight: '800', color: '#fecaca', marginBottom: 8 },
  resultScore: { fontSize: 56, fontWeight: '900', color: '#fff', marginBottom: 8 },
  resultMessage: { fontSize: 18, color: '#c4b5fd', textAlign: 'center', marginBottom: 28, lineHeight: 26 },
  shareTile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', paddingVertical: 14, paddingHorizontal: 20, marginBottom: 20, backgroundColor: 'rgba(251, 191, 36, 0.15)', borderRadius: 14, borderWidth: 2, borderColor: 'rgba(251, 191, 36, 0.5)' },
  shareTileText: { fontSize: 15, fontWeight: '600', color: '#fcd34d', textAlign: 'center', flex: 1 },
  playAgainBtn: { paddingVertical: 16, paddingHorizontal: 48, backgroundColor: '#f97316', borderRadius: 14 },
  playAgainText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  flyingCoin: { position: 'absolute', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  coinCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fbbf24', borderWidth: 2, borderColor: '#fcd34d' },
  levelUpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  levelUpCard: { backgroundColor: '#312e81', padding: 32, borderRadius: 24, alignItems: 'center', width: '100%', maxWidth: 320, borderWidth: 2, borderColor: '#fbbf24' },
  levelUpTitle: { fontSize: 28, fontWeight: '900', color: '#fbbf24', marginBottom: 8 },
  levelUpSub: { fontSize: 20, fontWeight: '700', color: '#e9d5ff', marginBottom: 24 },
  levelUpBtn: { paddingVertical: 14, paddingHorizontal: 40, backgroundColor: '#fbbf24', borderRadius: 14 },
  levelUpBtnText: { color: '#1e1b4b', fontWeight: '800', fontSize: 18 },
});
