import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Pressable,
  Image,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ImageCard } from '@/components/ImageCard';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';

const NEXT_QUIZ_DATE = 'Tuesday 24th February 2026';
const NEXT_QUIZ_DATE_AND_TIME = 'Tuesday 24th February 2026 at 7:00 PM GMT';
const NEXT_QUIZ_REMINDER_AT = new Date(Date.UTC(2026, 1, 24, 18, 50, 0));
const NEXT_QUIZ_RESET_AT = new Date(Date.UTC(2026, 1, 25, 0, 0, 0));
const LIVE_QUIZ_QUALIFIED_KEY = 'trivora_live_quiz_qualified_2026-02-24';

const FALLBACK_QUALIFY_ROUNDS: { question: string; options: string[]; correctIndex: number }[] = [
  { question: 'What is the capital of France?', options: ['Paris', 'London', 'Berlin', 'Madrid'], correctIndex: 0 },
  { question: 'How many continents are there?', options: ['5', '6', '7', '8'], correctIndex: 2 },
];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type SessionRow = { id: string; quiz_id: string; status: string; started_at: string | null; playback_url: string | null };
type QuizRow = { id: string; title: string };
type LiveQuizSessionRow = { id: string; title: string; status: string; scheduled_start_at: string | null };

export default function LiveTab() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [quizMap, setQuizMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qualified, setQualified] = useState(false);
  const [failed, setFailed] = useState(false);
  const [qualifyRound, setQualifyRound] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [qualifyRounds, setQualifyRounds] = useState<{ question: string; options: string[]; correctIndex: number }[] | null>(null);
  const [showQualifiedPopup, setShowQualifiedPopup] = useState(false);
  const [reminderSetting, setReminderSetting] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [liveQuizSessions, setLiveQuizSessions] = useState<LiveQuizSessionRow[]>([]);
  const [standingsModalSessionId, setStandingsModalSessionId] = useState<string | null>(null);
  const [standingsList, setStandingsList] = useState<{ rank: number; user_id: string; username: string | null; total_score: number; live_quiz_win_count?: number }[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);

  const LIVE_QUIZ_REMINDER_ID = 'live-quiz-reminder';

  const openStandings = async (sessionId: string) => {
    setStandingsModalSessionId(sessionId);
    setStandingsLoading(true);
    setStandingsList([]);
    try {
      const { data: scores } = await supabase
        .from('live_quiz_scores')
        .select('user_id, total_score')
        .eq('session_id', sessionId)
        .order('total_score', { ascending: false })
        .limit(30);
      const rows = (scores ?? []) as { user_id: string; total_score: number }[];
      if (rows.length === 0) {
        setStandingsList([]);
        setStandingsLoading(false);
        return;
      }
      const ids = rows.map((r) => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, username, live_quiz_win_count').in('id', ids);
      const profileMap = Object.fromEntries(
        ((profiles ?? []) as { id: string; username: string | null; live_quiz_win_count?: number }[]).map((p) => [p.id, p])
      );
      setStandingsList(rows.map((r, i) => {
        const p = profileMap[r.user_id];
        return {
          rank: i + 1,
          user_id: r.user_id,
          username: p?.username ?? null,
          total_score: r.total_score,
          live_quiz_win_count: p?.live_quiz_win_count ?? 0,
        };
      }));
    } catch {
      setStandingsList([]);
    }
    setStandingsLoading(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const now = Date.now();
        if (now >= NEXT_QUIZ_RESET_AT.getTime()) {
          await SecureStore.deleteItemAsync(LIVE_QUIZ_QUALIFIED_KEY);
          return;
        }
        const stored = await SecureStore.getItemAsync(LIVE_QUIZ_QUALIFIED_KEY);
        if (stored === 'true') setQualified(true);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: rows } = await supabase
          .from('questions')
          .select('prompt, answers_json, correct_index')
          .eq('is_active', true)
          .eq('difficulty', 1)
          .limit(30);
        if (rows && rows.length >= 2) {
          const shuffled = shuffle(rows);
          const picked = shuffled.slice(0, 2).map((r: { prompt: string; answers_json: unknown; correct_index: number }) => ({
            question: r.prompt ?? '',
            options: Array.isArray(r.answers_json) ? (r.answers_json as string[]) : [],
            correctIndex: Math.max(0, Math.min(r.correct_index ?? 0, (Array.isArray(r.answers_json) ? (r.answers_json as string[]).length : 1) - 1)),
          }));
          if (picked.every((p) => p.options.length >= 2)) {
            setQualifyRounds(picked);
            return;
          }
        }
      } catch {
        // use fallback
      }
      setQualifyRounds([]);
    })();
  }, []);

  const qualifyQuestions = qualifyRounds !== null && qualifyRounds.length >= 2 ? qualifyRounds : FALLBACK_QUALIFY_ROUNDS;
  const qualifyLoading = qualifyRounds === null;
  const currentRoundIndex = Math.min(Math.max(0, qualifyRound), qualifyQuestions.length - 1);
  const currentRound = qualifyQuestions[currentRoundIndex];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionsRes, liveQuizRes] = await Promise.all([
          supabase.from('live_sessions').select('id, quiz_id, status, started_at, playback_url').in('status', ['scheduled', 'live']).order('started_at', { ascending: false }).limit(10),
          supabase.from('live_quiz_sessions').select('id, title, status, scheduled_start_at').in('status', ['draft', 'scheduled', 'live']).order('scheduled_start_at', { ascending: false, nullsFirst: false }).limit(10),
        ]);
        if (cancelled) return;
        const list = (sessionsRes.data ?? []) as SessionRow[];
        setSessions(list);
        setLiveQuizSessions((liveQuizRes.data ?? []) as LiveQuizSessionRow[]);
        if (list.length) {
          const ids = [...new Set(list.map((s) => s.quiz_id))];
          const { data: quizzesData } = await supabase.from('quizzes').select('id, title').in('id', ids);
          if (cancelled) return;
          const quizzes = (quizzesData ?? []) as QuizRow[];
          setQuizMap(Object.fromEntries(quizzes.map((q) => [q.id, q.title])));
        }
      } catch {
        // show UI anyway
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSetReminder = async () => {
    if (reminderSet) {
      setShowQualifiedPopup(false);
      return;
    }
    setReminderSetting(true);
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('live-quiz', {
          name: 'Live Quiz',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let status = existingStatus;
      if (existingStatus !== 'granted') {
        const { status: requested } = await Notifications.requestPermissionsAsync();
        status = requested;
      }
      if (status !== 'granted') {
        Alert.alert(
          'Reminder not set',
          'Enable notifications in Settings to get a reminder before the live quiz.',
          [{ text: 'OK', onPress: () => setShowQualifiedPopup(false) }]
        );
        setReminderSetting(false);
        return;
      }
      const now = Date.now();
      const reminderTime = NEXT_QUIZ_REMINDER_AT.getTime();
      if (reminderTime <= now) {
        Alert.alert(
          'Quiz already passed',
          'The next live quiz time has passed. Check back for the next date!',
          [{ text: 'OK', onPress: () => setShowQualifiedPopup(false) }]
        );
        setReminderSetting(false);
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(LIVE_QUIZ_REMINDER_ID);
      const secondsFromNow = Math.max(60, (reminderTime - now) / 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Live Quiz in 10 minutes!',
          body: 'Your qualifying quiz starts at 7:00 PM GMT. Don\'t miss it!',
          data: {},
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsFromNow,
          repeats: false,
          ...(Platform.OS === 'android' && { channelId: 'live-quiz' }),
        },
        identifier: LIVE_QUIZ_REMINDER_ID,
      });
      setReminderSet(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const atTime = NEXT_QUIZ_REMINDER_AT.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
      Alert.alert(
        'Reminder set',
        `You'll get a notification at ${atTime} (10 minutes before the live quiz).`,
        [{ text: 'OK', onPress: () => setShowQualifiedPopup(false) }]
      );
    } catch (e) {
      Alert.alert('Could not set reminder', e instanceof Error ? e.message : 'Please try again later.', [{ text: 'OK' }]);
    }
    setReminderSetting(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#9146ff" />
      </View>
    );
  }

  const cardWidth = Math.min(width - 32, 400);
  const videoHeight = Math.min(width * 0.5, height * 0.22);
  const leaderboardStripHeight = 76;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Section 1: Live stream (same as live-quiz screen) */}
      <View style={[styles.sectionVideo, { height: videoHeight }]}>
        <LinearGradient colors={['#1e1b4b', '#312e81']} style={StyleSheet.absoluteFill} />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <View style={styles.playIconRing}>
          <Image source={require('@/assets/mahan.png')} style={styles.topHalfIcon} resizeMode="contain" />
        </View>
        <Text style={styles.videoPlaceholderLabel}>Live quiz</Text>
        <Text style={styles.videoPlaceholderSub}>Stream will appear here when live</Text>
        <Text style={styles.sectionLabel}>LIVE STREAM</Text>
      </View>

      {/* Section 2: Leaderboard strip (same as live-quiz screen) */}
      <View style={[styles.sectionLeaderboard, { height: leaderboardStripHeight }]}>
        <View style={styles.leaderboardPreviewHeader}>
          <Ionicons name="podium" size={16} color="#a78bfa" />
          <Text style={styles.leaderboardPreviewTitle}>Leaderboard</Text>
        </View>
        <Text style={styles.leaderboardTap}>
          {liveQuizSessions.length > 0 ? 'Tap a session below to join and see the leaderboard' : 'Sessions will appear below when a live quiz is scheduled'}
        </Text>
      </View>

      <View style={styles.sectionDivider} />

      {/* Section 3: Main — always scrollable; session list + qualify or "waiting" message */}
      <View style={styles.sectionMain}>
        <ScrollView
          style={styles.bottomScroll}
          contentContainerStyle={styles.bottomScrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Session list first — hero "tap to join" cards (AAA-style) */}
          {liveQuizSessions.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Trivora Live Quiz</Text>
              {liveQuizSessions.map((item) => (
                <View key={item.id} style={styles.sessionBlock}>
                  <Link href={`/live-quiz/${item.id}`} asChild>
                    <Pressable style={({ pressed }) => [styles.joinHeroCard, pressed && styles.joinHeroCardPressed]}>
                      <Image
                        source={{ uri: PLACEHOLDER_IMAGES.liveQuiz }}
                        style={styles.joinHeroImage}
                      />
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(30,27,75,0.92)']}
                        style={styles.joinHeroGradient}
                      />
                      <View style={styles.joinHeroGlow} />
                      <View style={styles.joinHeroContent}>
                        {item.status === 'live' && (
                          <View style={styles.joinHeroLiveBadge}>
                            <View style={styles.joinHeroLiveDot} />
                            <Text style={styles.joinHeroLiveText}>LIVE</Text>
                          </View>
                        )}
                        <Text style={styles.joinHeroTitle} numberOfLines={2}>{item.title}</Text>
                        {item.scheduled_start_at ? (
                          <Text style={styles.joinHeroSubtitle}>
                            {new Date(item.scheduled_start_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </Text>
                        ) : null}
                        <View style={styles.joinHeroCta}>
                          <Ionicons name="play-circle" size={28} color="#fef08a" />
                          <Text style={styles.joinHeroCtaText}>TAP TO JOIN</Text>
                        </View>
                      </View>
                    </Pressable>
                  </Link>
                  <Pressable
                    style={[styles.showStandingsBtn, styles.showStandingsBtnBelowHero]}
                    onPress={() => openStandings(item.id)}
                  >
                    <Ionicons name="podium-outline" size={18} color="#c4b5fd" />
                    <Text style={styles.showStandingsBtnText}>Standings</Text>
                  </Pressable>
                </View>
              ))}
              <View style={styles.sectionDividerInScroll} />
            </>
          )}
          {qualified ? (
            <View style={styles.liveQuizPlaceholderInner}>
              <View style={styles.liveQuizPlaceholderIconWrap}>
                <Image source={require('@/assets/mahan.png')} style={styles.liveQuizPlaceholderImage} resizeMode="contain" />
              </View>
              <Text style={styles.liveQuizPlaceholderTitle}>Live quiz</Text>
              <View style={styles.liveQuizPlaceholderDivider} />
              <Text style={styles.liveQuizPlaceholderMessage}>
                {liveQuizSessions.length > 0
                  ? 'Tap a session above to watch the stream and play. Questions will appear there when the quiz starts.'
                  : 'No live sessions right now. Check back later or ask the host to start one.'}
              </Text>
            </View>
          ) : (
            <View style={[styles.qualifyWrap, { width: cardWidth }]}>
              {qualifyLoading ? (
                <View style={styles.qualifyLoading}>
                  <ActivityIndicator size="small" color="#9146ff" />
                  <Text style={styles.qualifyLoadingText}>Loading qualifying questions...</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.qualifyIntro, qualifyRound === 1 && styles.qualifyIntroIncorrect]}>
                    {qualifyRound === 0
                      ? 'You must answer the following question correctly to qualify.'
                      : "Oh no! That's incorrect. You have one more chance to enter. (Definitely do not google the answer)."}
                  </Text>
                  {qualifyRound === 1 && (
                    <View style={styles.finalChanceBadge}>
                      <Text style={styles.finalChanceText}>FINAL CHANCE</Text>
                    </View>
                  )}
                  {currentRound ? (
                    <>
                      <Text style={styles.qualifyQuestion}>{String(currentRound?.question ?? '')}</Text>
                      <View style={styles.optionGrid}>
                        {(Array.isArray(currentRound?.options) ? currentRound.options : []).map((option, index) => {
                          const correctIndex = Math.max(0, Math.min(currentRound?.correctIndex ?? 0, (currentRound?.options?.length ?? 1) - 1));
                          const isCorrect = index === correctIndex;
                          const isSelected = selectedIndex === index;
                          const showGreen = (qualified && isCorrect) || (failed && isCorrect);
                          const showRed = failed && isSelected && !isCorrect;
                          return (
                            <Pressable
                              key={index}
                              style={[
                                styles.optionBtn,
                                showGreen && styles.optionBtnCorrect,
                                showRed && styles.optionBtnWrong,
                                isSelected && !showGreen && !showRed && styles.optionBtnSelected,
                              ]}
                              onPress={() => {
                                if (qualified || failed) return;
                                setSelectedIndex(index);
                                if (isCorrect) {
                                  setQualified(true);
                                  SecureStore.setItemAsync(LIVE_QUIZ_QUALIFIED_KEY, 'true').catch(() => {});
                                  setShowQualifiedPopup(true);
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                } else if (qualifyRound === 1) setFailed(true);
                                else {
                                  setQualifyRound(1);
                                  setSelectedIndex(null);
                                }
                              }}
                              disabled={qualified || failed}
                            >
                              <Text
                                style={[
                                  styles.optionText,
                                  showGreen && styles.optionTextCorrect,
                                  showRed && styles.optionTextWrong,
                                ]}
                                numberOfLines={1}
                              >
                                {option}
                              </Text>
                              {showGreen && (
                                <Ionicons name="checkmark-circle" size={22} color="#22c55e" style={styles.optionCheck} />
                              )}
                              {showRed && (
                                <Ionicons name="close-circle" size={22} color="#ef4444" style={styles.optionCheck} />
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                  {failed && (
                    <Text style={styles.failedMessage}>
                      Incorrect. You can try again when the next quiz is announced.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

            {sessions.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Scheduled & Live</Text>
                {sessions.map((item) => {
                  const title = quizMap[item.quiz_id] ?? 'Live Quiz';
                  const sub = `${item.status} · ${item.started_at ? new Date(item.started_at).toLocaleString() : '—'}`;
                  const isLive = item.status === 'live' && item.playback_url;
                  if (isLive) {
                    return (
                      <Link key={item.id} href={`/live/${item.id}`} asChild>
                        <ImageCard
                          source={{ uri: PLACEHOLDER_IMAGES.liveQuiz }}
                          title={title}
                          subtitle={sub + ' · Tap to watch & play'}
                        />
                      </Link>
                    );
                  }
                  return (
                    <ImageCard
                      key={item.id}
                      source={{ uri: PLACEHOLDER_IMAGES.liveQuiz }}
                      title={title}
                      subtitle={sub}
                      disabled
                    />
                  );
                })}
              </>
            )}
        </ScrollView>
      </View>

      {/* Full-screen standings overlay (top 30) */}
      <Modal
        visible={standingsModalSessionId != null}
        animationType="slide"
        onRequestClose={() => setStandingsModalSessionId(null)}
      >
        <View style={[styles.standingsFullScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.standingsHeader}>
            <Text style={styles.standingsTitle}>Standings</Text>
            <Pressable style={styles.standingsCloseBtn} onPress={() => setStandingsModalSessionId(null)} hitSlop={12}>
              <Ionicons name="close" size={28} color="#e2e8f0" />
            </Pressable>
          </View>
          {standingsLoading ? (
            <View style={styles.standingsLoadingWrap}>
              <ActivityIndicator size="large" color="#a78bfa" />
              <Text style={styles.standingsLoadingText}>Loading…</Text>
            </View>
          ) : (
            <ScrollView style={styles.standingsScroll} contentContainerStyle={styles.standingsScrollContent} showsVerticalScrollIndicator>
              {standingsList.length === 0 ? (
                <Text style={styles.standingsEmpty}>No scores yet for this session.</Text>
              ) : (
                standingsList.map((e) => (
                  <View key={e.user_id} style={styles.standingsRow}>
                    <Text style={styles.standingsRank}>#{e.rank}</Text>
                    <Text style={styles.standingsName} numberOfLines={1}>{e.username ?? '—'}</Text>
                    <Text style={styles.standingsScore}>{e.total_score} pts</Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        visible={showQualifiedPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualifiedPopup(false)}
      >
        <Pressable style={styles.qualifiedModalBackdrop} onPress={() => setShowQualifiedPopup(false)}>
          <Pressable style={styles.qualifiedModalCardWrap} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={['#22c55e', '#16a34a', '#15803d']}
              style={styles.qualifiedModalCard}
            >
              <View style={styles.qualifiedModalIconWrap}>
                <Ionicons name="trophy" size={56} color="#fef08a" />
              </View>
              <Text style={styles.qualifiedModalTitle}>You're in!</Text>
              <Text style={styles.qualifiedModalMessage}>
                Correct! You have qualified for the quiz. See you on {NEXT_QUIZ_DATE_AND_TIME}
              </Text>
              <Pressable
                style={styles.qualifiedModalOkBtn}
                onPress={handleSetReminder}
                disabled={reminderSetting}
              >
                {reminderSetting ? (
                  <ActivityIndicator size="small" color="#15803d" />
                ) : (
                  <Text style={styles.qualifiedModalOkText}>
                    {reminderSet ? 'OK' : 'Set reminder'}
                  </Text>
                )}
              </Pressable>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* Section 1: Live stream (matches live-quiz screen) */
  sectionVideo: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  sectionLabel: {
    position: 'absolute',
    bottom: 6,
    left: 10,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  videoPlaceholderLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
  },
  videoPlaceholderSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  playIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(167, 139, 250, 0.35)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topHalfIcon: {
    width: 40,
    height: 40,
  },
  /* Section 2: Leaderboard strip */
  sectionLeaderboard: {
    width: '100%',
    backgroundColor: 'rgba(30,27,75,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.25)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  leaderboardPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  leaderboardPreviewTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#c4b5fd',
  },
  leaderboardTap: {
    fontSize: 10,
    color: '#64748b',
  },
  sectionDivider: {
    height: 2,
    backgroundColor: 'rgba(167,139,250,0.2)',
    width: '100%',
  },
  /* Section 3: Main content */
  sectionMain: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  bottomScroll: {
    flex: 1,
  },
  bottomScrollContent: {
    padding: 16,
    paddingBottom: 100,
    alignSelf: 'center',
    maxWidth: 400,
    width: '100%',
  },
  qualifyWrap: {
    alignSelf: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  liveQuizPlaceholderFull: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#18181b',
    borderTopWidth: 1,
    borderTopColor: 'rgba(167, 139, 250, 0.2)',
  },
  liveQuizPlaceholderInner: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    maxWidth: 400,
  },
  liveQuizPlaceholderIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(63, 63, 70, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  liveQuizPlaceholderImage: {
    width: 56,
    height: 56,
  },
  liveQuizPlaceholderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a1a1aa',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  liveQuizPlaceholderDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(145, 70, 255, 0.5)',
    marginBottom: 14,
  },
  liveQuizPlaceholderMessage: {
    fontSize: 15,
    fontWeight: '500',
    color: '#d4d4d8',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  qualifyLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  qualifyLoadingText: {
    fontSize: 14,
    color: '#adadb8',
  },
  qualifyIntro: {
    fontSize: 14,
    color: '#adadb8',
    marginBottom: 14,
    lineHeight: 20,
  },
  qualifyIntroIncorrect: {
    color: '#f97316',
  },
  qualifyQuestion: {
    fontSize: 17,
    fontWeight: '700',
    color: '#efeff1',
    marginBottom: 16,
  },
  finalChanceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#b91c1c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 14,
  },
  finalChanceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  optionBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#26262c',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionBtnSelected: {
    borderColor: '#9146ff',
    backgroundColor: '#1f1f23',
  },
  optionBtnCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: '#22c55e',
  },
  optionBtnWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#efeff1',
  },
  optionTextCorrect: {
    color: '#22c55e',
  },
  optionTextWrong: {
    color: '#ef4444',
  },
  optionCheck: {
    marginLeft: 8,
  },
  failedMessage: {
    fontSize: 14,
    color: '#f97316',
    marginTop: 14,
    textAlign: 'center',
  },
  sessionBlock: {
    marginBottom: 20,
  },
  joinHeroCard: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(167, 139, 250, 0.5)',
    shadowColor: '#a78bfa',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  joinHeroCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  joinHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  joinHeroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  joinHeroGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(254, 240, 138, 0.25)',
  },
  joinHeroContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
    paddingTop: 16,
  },
  joinHeroLiveBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  joinHeroLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  joinHeroLiveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  joinHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  joinHeroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 12,
  },
  joinHeroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(167, 139, 250, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(254, 240, 138, 0.5)',
  },
  joinHeroCtaText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fef08a',
    letterSpacing: 1.2,
  },
  showStandingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30,27,75,0.9)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  showStandingsBtnBelowHero: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  showStandingsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#c4b5fd',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#adadb8',
    marginBottom: 12,
  },
  sectionDividerInScroll: {
    height: 1,
    backgroundColor: 'rgba(167,139,250,0.2)',
    width: '100%',
    marginVertical: 16,
  },
  standingsFullScreen: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  standingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.25)',
  },
  standingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  standingsCloseBtn: {
    padding: 4,
  },
  standingsLoadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  standingsLoadingText: {
    fontSize: 15,
    color: '#94a3b8',
  },
  standingsScroll: { flex: 1 },
  standingsScrollContent: { padding: 16, paddingBottom: 32 },
  standingsEmpty: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 24,
  },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.15)',
    gap: 12,
  },
  standingsRank: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94a3b8',
    minWidth: 36,
  },
  standingsName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  standingsScore: {
    fontSize: 16,
    fontWeight: '700',
    color: '#a78bfa',
  },
  qualifiedModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qualifiedModalCardWrap: {
    width: '100%',
    maxWidth: 340,
  },
  qualifiedModalCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(254, 240, 138, 0.6)',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  qualifiedModalIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  qualifiedModalTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  qualifiedModalMessage: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  qualifiedModalOkBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
  },
  qualifiedModalOkText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803d',
  },
});
