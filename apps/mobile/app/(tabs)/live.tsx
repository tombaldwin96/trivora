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
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { ImageCard } from '@/components/ImageCard';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';

const NEXT_QUIZ_DATE = 'Tuesday 17th February 2026';
const NEXT_QUIZ_DATE_AND_TIME = 'Tuesday 17th February 2026 at 8:00 PM';

const QUALIFY_ROUNDS: { question: string; options: string[]; correctIndex: number }[] = [
  { question: 'What is the capital of France?', options: ['Paris', 'London', 'Berlin', 'Madrid'], correctIndex: 0 },
  { question: 'How many continents are there?', options: ['5', '6', '7', '8'], correctIndex: 2 },
];

type SessionRow = { id: string; quiz_id: string; status: string; started_at: string | null; playback_url: string | null };
type QuizRow = { id: string; title: string };

export default function LiveTab() {
  const { width } = useWindowDimensions();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [quizMap, setQuizMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qualified, setQualified] = useState(false);
  const [failed, setFailed] = useState(false);
  const [qualifyRound, setQualifyRound] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sessionsData } = await supabase
        .from('live_sessions')
        .select('id, quiz_id, status, started_at, playback_url')
        .in('status', ['scheduled', 'live'])
        .order('started_at', { ascending: false })
        .limit(10);
      const list = (sessionsData ?? []) as SessionRow[];
      setSessions(list);
      if (list.length) {
        const ids = [...new Set(list.map((s) => s.quiz_id))];
        const { data: quizzesData } = await supabase.from('quizzes').select('id, title').in('id', ids);
        const quizzes = (quizzesData ?? []) as QuizRow[];
        setQuizMap(Object.fromEntries(quizzes.map((q) => [q.id, q.title])));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#9146ff" />
      </View>
    );
  }

  const cardWidth = width - 32;
  const thumbnailHeight = Math.round((cardWidth * 9) / 16);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Stream-style hero card — Twitch/TikTok vibe */}
      <View style={[styles.heroWrap, { width: cardWidth }]}>
        <View style={[styles.thumbnail, { height: thumbnailHeight }]}>
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f0f23']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.thumbnailOverlay} />
          {/* "OFFLINE" / "NEXT" badge */}
          <View style={styles.badgeRow}>
            <View style={styles.upcomingBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.upcomingBadgeText}>UPCOMING</Text>
            </View>
          </View>
          {/* Center icon */}
          <View style={styles.playIconRing}>
            <Ionicons name="play" size={48} color="rgba(255,255,255,0.9)" />
          </View>
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroTitle}>Next Live Quiz</Text>
          <Text style={styles.heroDate}>{NEXT_QUIZ_DATE}</Text>
          <Text style={styles.heroSubtitle}>Come back then to compete!</Text>
          <View style={styles.viewerRow}>
            <Ionicons name="people-outline" size={16} color="#adadb8" />
            <Text style={styles.viewerText}>Be there when it goes live</Text>
          </View>
        </View>
      </View>

      {/* Qualifying question(s) */}
      <View style={[styles.qualifyWrap, { width: cardWidth }]}>
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
        {(() => {
          const round = QUALIFY_ROUNDS[qualifyRound];
          const { question, options, correctIndex } = round;
          return (
            <>
              <Text style={styles.qualifyQuestion}>{question}</Text>
              <View style={styles.optionGrid}>
                {options.map((option, index) => {
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
                        if (isCorrect) setQualified(true);
                        else if (qualifyRound === 1) setFailed(true);
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
          );
        })()}
        {qualified && (
          <Text style={styles.correctMessage}>
            Correct! You have qualified for the quiz. See you on {NEXT_QUIZ_DATE_AND_TIME}
          </Text>
        )}
        {failed && (
          <Text style={styles.failedMessage}>
            Incorrect. You can try again when the next quiz is announced.
          </Text>
        )}
      </View>

      {/* Optional: scheduled / live sessions list */}
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

      <View style={styles.footerMahan}>
        <Image source={require('@/assets/mahan.png')} style={styles.footerMahanImage} resizeMode="contain" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e10',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 49,
    paddingBottom: 100,
  },
  footerMahan: {
    alignSelf: 'center',
    marginTop: 48,
    marginBottom: 8,
  },
  footerMahanImage: {
    width: 100,
    height: 100,
  },
  heroWrap: {
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    marginBottom: 24,
    shadowColor: '#9146ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  thumbnail: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  badgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(145, 70, 255, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  upcomingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  playIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(145, 70, 255, 0.4)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInfo: {
    padding: 16,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#efeff1',
    marginBottom: 4,
  },
  heroDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9146ff',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#adadb8',
    marginBottom: 10,
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewerText: {
    fontSize: 13,
    color: '#adadb8',
  },
  qualifyWrap: {
    alignSelf: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
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
  correctMessage: {
    fontSize: 15,
    fontWeight: '600',
    color: '#22c55e',
    marginTop: 14,
    textAlign: 'center',
  },
  failedMessage: {
    fontSize: 14,
    color: '#f97316',
    marginTop: 14,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#adadb8',
    marginBottom: 12,
  },
});
