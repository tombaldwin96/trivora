import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ImageBackground,
  Share,
  Alert,
  useWindowDimensions,
  Animated,
  Linking,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { DIVISION_NAMES } from '@mahan/core';

const REFERRAL_CODE = 'summer-house-breeze';

type Standing1v1 = {
  division: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  season_number: number;
} | null;

function formatDailyDate() {
  const d = new Date();
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${day}${suffix} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getCalendarDate() {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { day: d.getDate(), month: months[d.getMonth()], year: d.getFullYear() };
}

export default function TabHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const [standing1v1, setStanding1v1] = useState<Standing1v1>(null);
  const playShakeX = useRef(new Animated.Value(0)).current;
  const sheenX = useRef(new Animated.Value(-100)).current;

  const runSheen = () => {
    sheenX.setValue(-100);
    Animated.timing(sheenX, {
      toValue: width + 100,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

  const runPlayShake = () => {
    Animated.sequence([
      Animated.timing(playShakeX, { toValue: -5, duration: 45, useNativeDriver: true }),
      Animated.timing(playShakeX, { toValue: 5, duration: 45, useNativeDriver: true }),
      Animated.timing(playShakeX, { toValue: -4, duration: 45, useNativeDriver: true }),
      Animated.timing(playShakeX, { toValue: 4, duration: 45, useNativeDriver: true }),
      Animated.timing(playShakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    const t = setTimeout(runPlayShake, 10000);
    const id = setInterval(runPlayShake, 10000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(runSheen, 3000);
    const id = setInterval(runSheen, 3000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [width]);

  const level = Math.max(1, Math.floor((standing1v1?.points ?? 0) / 100) + 1);

  const showLevelPopup = () => {
    Alert.alert(
      `Level ${level}`,
      `You are currently a level ${level}. Play and win games to gain points and increase your knowledge score.`,
      [{ text: 'OK' }]
    );
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
      supabase
        .from('standings')
        .select('division, points, wins, draws, losses, seasons(season_number)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data && 'seasons' in data && data.seasons && typeof data.seasons === 'object' && 'season_number' in data.seasons) {
            setStanding1v1({
              division: data.division,
              points: data.points ?? 0,
              wins: data.wins ?? 0,
              draws: data.draws ?? 0,
              losses: data.losses ?? 0,
              season_number: (data.seasons as { season_number: number }).season_number,
            });
          } else if (data) {
            setStanding1v1({
              division: data.division,
              points: data.points ?? 0,
              wins: data.wins ?? 0,
              draws: data.draws ?? 0,
              losses: data.losses ?? 0,
              season_number: 1,
            });
          }
        });
    });
  }, [router]);

  const copyReferralCode = async () => {
    await Clipboard.setStringAsync(REFERRAL_CODE);
    Alert.alert('Copied!', 'Referral code copied to clipboard.');
  };

  const shareReferralCode = () => {
    Share.share({
      message: `Join me on Mahan! Use my referral code: ${REFERRAL_CODE}`,
      title: 'Join Mahan',
    });
  };

  const rowPadding = 12;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header — padding to clear status/safe area and space content */}
      <View style={[styles.header, { paddingTop: 55, paddingBottom: 7 }, isDark && styles.headerDark]}>
        <View style={styles.brandRow}>
          <Image source={require('@/assets/Logo.png')} style={styles.headerLogo} />
          <View>
            <Text style={[styles.appName, isDark && styles.appNameDark]}>Mahan: The Quiz App</Text>
            <Text style={[styles.tagline, isDark && styles.taglineDark]}>Outthink. Outplay. Outrank.</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={showLevelPopup} style={styles.levelButton} hitSlop={8}>
            <View style={styles.levelStarWrap}>
              <View style={styles.levelStarBackdrop}>
                <Ionicons name="star" size={16} color="#fff" />
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelLabel}>LVL {level}</Text>
              </View>
            </View>
          </Pressable>
          <Link href="/settings" asChild>
            <Pressable style={styles.iconButton} hitSlop={12}>
              <Ionicons name="settings-outline" size={24} color={isDark ? '#adadb8' : '#374151'} />
            </Pressable>
          </Link>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 0 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's Daily Quiz — calendar left, title + Play Now right */}
        <View style={styles.dailyCardWrap}>
          <View style={styles.dailyCardInner}>
            <LinearGradient
              colors={['#5b21b6', '#6d28d9', '#7c3aed']}
              style={styles.dailyCard}
            >
              <View style={styles.dailyCardAccent} />
              <View style={styles.dailyCardRow}>
                <View style={styles.dailyCalendarHalf}>
                  <View style={styles.dailyCalendarIconWrap}>
                    <Ionicons name="calendar" size={22} color="rgba(255,255,255,0.95)" />
                  </View>
                  <Text style={styles.dailyCalendarDay}>{getCalendarDate().day}</Text>
                  <Text style={styles.dailyCalendarMonth}>{getCalendarDate().month} {getCalendarDate().year}</Text>
                </View>
                <View style={styles.dailyQuizHalf}>
                  <Text style={styles.dailyTitle}>Today's Daily Quiz</Text>
                  <Text style={styles.dailyMeta}>10 questions • 10 subjects</Text>
                  <View style={styles.playNowWrap}>
                    <Animated.View style={[styles.playNowShake, { transform: [{ translateX: playShakeX }] }]}>
                      <Link href="/quiz/daily" asChild>
                        <Pressable style={styles.playNowBtn}>
                          <Text style={styles.playNowText}>Play Now</Text>
                        </Pressable>
                      </Link>
                    </Animated.View>
                  </View>
                </View>
              </View>
            </LinearGradient>
            <Animated.View
              style={[styles.dailyCardSheen, { transform: [{ translateX: sheenX }] }]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.06)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dailyCardSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Online game — same format as Today's Daily Quiz: left = icon + title, right = buttons */}
        <View style={[styles.rewardsCard, isDark && styles.rewardsCardDark]}>
          <View style={styles.onlineGameRow}>
            <View style={styles.onlineGameLeft}>
              <View style={styles.onlineGameIconWrap}>
                <Ionicons name="globe-outline" size={28} color={isDark ? '#a1a1aa' : '#6b7280'} />
              </View>
              <Text style={[styles.rewardsTitle, styles.onlineGameTitleLeft, isDark && styles.rewardsTitleDark]}>Online game</Text>
            </View>
            <View style={styles.onlineGameRight}>
              <Link href="/(tabs)/modes" asChild>
                <Pressable style={styles.onlineGameBtn}>
                  <LinearGradient colors={['#6d28d9', '#7c3aed']} style={[styles.learnMoreGradient, styles.onlineGameGradientFill]}>
                    <Text style={styles.learnMoreText}>Quick match</Text>
                  </LinearGradient>
                </Pressable>
              </Link>
              <Pressable style={styles.onlineGameBtn}>
                <LinearGradient colors={['#6d28d9', '#7c3aed']} style={[styles.learnMoreGradient, styles.onlineGameGradientFill]}>
                  <Text style={styles.learnMoreText}>Invite match</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Invite & earn rewards */}
        <View style={styles.referralCard}>
          <View style={styles.referralIconWrap}>
            <Ionicons name="medal-outline" size={32} color="#d97706" />
          </View>
          <Text style={styles.referralTitle}>Invite friends & earn rewards!</Text>
          <Text style={styles.referralPromo}>Complete 1 game with 3 friends to get 3 free months!</Text>
          <Text style={styles.referralLabel}>Your referral code:</Text>
          <Pressable style={styles.referralCodeBtn} onPress={copyReferralCode}>
            <Text style={styles.referralCodeText}>{REFERRAL_CODE}</Text>
            <Ionicons name="copy-outline" size={18} color="#fff" />
          </Pressable>
          <Pressable style={styles.shareBtn} onPress={shareReferralCode}>
            <Text style={styles.shareBtnText}>Share your code</Text>
            <Ionicons name="share-social-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Tournaments */}
        <Pressable onPress={() => router.push('/modes/tournament')}>
          <ImageBackground source={require('@/assets/tournament.png')} style={styles.tournamentsCard} imageStyle={styles.tournamentsCardImage}>
            <View style={[styles.tournamentsOverlay, styles.tournamentsOverlay50]}>
              <View style={styles.tournamentsContent}>
                <View style={styles.rewardsIconWrap}>
                  <Ionicons name="trophy-outline" size={28} color="#fff" />
                </View>
                <Text style={[styles.rewardsTitle, styles.tournamentsCenterText, styles.tournamentsTextWhite]}>Tournaments</Text>
                <Text style={[styles.oneVOneEmpty, styles.tournamentsCenterText, styles.tournamentsTextWhite]}>Bracket tournaments · Coming in V1</Text>
              </View>
            </View>
          </ImageBackground>
        </Pressable>

        {/* Leaderboards */}
        <Pressable onPress={() => router.push('/(tabs)/leaderboards')}>
          <ImageBackground source={require('@/assets/leaderboard.png')} style={[styles.tournamentsCard, styles.tournamentsCardLast]} imageStyle={styles.tournamentsCardImage}>
            <View style={styles.tournamentsOverlay}>
              <View style={styles.tournamentsContent}>
                <View style={styles.rewardsIconWrap}>
                  <Ionicons name="podium-outline" size={28} color="#fff" />
                </View>
                <Text style={[styles.rewardsTitle, styles.tournamentsCenterText, styles.tournamentsTextWhite]}>Leaderboards</Text>
                <Text style={[styles.oneVOneEmpty, styles.tournamentsCenterText, styles.tournamentsTextWhite]}>Climb the ranks. Be the best.</Text>
              </View>
            </View>
          </ImageBackground>
        </Pressable>

        <View style={styles.footerRow}>
          <View style={styles.footerSocial}>
            <Pressable onPress={() => Linking.openURL('https://www.instagram.com/mahanlankarani/')} style={styles.footerSocialBtn}>
              <Ionicons name="logo-instagram" size={28} color={isDark ? '#a1a1aa' : '#374151'} />
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://www.tiktok.com/@mahanlankarani?lang=en')} style={styles.footerSocialBtn}>
              <Ionicons name="logo-tiktok" size={26} color={isDark ? '#a1a1aa' : '#374151'} />
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://www.etsy.com/listing/4427244906/is-your-general-knowledge-above-average?etsrc=sdt')} style={styles.footerSocialBtn}>
              <Ionicons name="book-outline" size={26} color={isDark ? '#a1a1aa' : '#374151'} />
            </Pressable>
          </View>
          <View style={styles.footerMahan}>
            <Image source={require('@/assets/mahan.png')} style={styles.footerMahanImage} resizeMode="contain" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDark: { backgroundColor: '#0e0e10' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  headerDark: { backgroundColor: '#0e0e10', borderBottomColor: '#2a2a2e' },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  appName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  tagline: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  appNameDark: { color: '#efeff1' },
  taglineDark: { color: '#adadb8' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  levelButton: {
    padding: 4,
  },
  levelStarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelStarBackdrop: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8b5cf6',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    marginTop: 3,
    backgroundColor: 'rgba(139, 92, 246, 0.95)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  levelLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },
  iconButton: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 16,
    alignItems: 'stretch',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 0,
  },
  footerMahan: {
    marginBottom: 0,
  },
  footerMahanImage: {
    width: 100,
    height: 100,
  },
  footerSocial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerSocialBtn: {
    padding: 8,
  },
  dailyCardWrap: {
    borderRadius: 20,
    overflow: 'visible',
    marginBottom: 16,
  },
  dailyCardInner: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    shadowColor: '#4c1d95',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  dailyCard: {
    padding: 0,
    minHeight: 160,
    borderRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: 20,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftColor: 'rgba(255,255,255,0.14)',
  },
  dailyCardAccent: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dailyCardRow: {
    flexDirection: 'row',
    flex: 1,
    minHeight: 160,
  },
  dailyCalendarHalf: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyCalendarIconWrap: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
  dailyCalendarDay: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 46,
  },
  dailyCalendarMonth: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  dailyQuizHalf: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  dailyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  dailyMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
    letterSpacing: 0.15,
  },
  playNowWrap: {
    marginTop: 14,
    alignSelf: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
  },
  playNowShake: {},
  playNowBtn: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  dailyCardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 100,
    borderRadius: 20,
    overflow: 'hidden',
  },
  dailyCardSheenGradient: {
    flex: 1,
    width: 100,
    borderRadius: 20,
  },
  playNowText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7c3aed',
  },
  twoCardRowWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  twoCardRow: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  smallCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  smallCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  onlineGameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  onlineGameLeft: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  onlineGameIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e9e5ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineGameRight: {
    flex: 1,
    gap: 10,
  },
  onlineGameTitleLeft: {
    marginBottom: 0,
    textAlign: 'center',
  },
  onlineGameBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  onlineGameGradientFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  referralCard: {
    backgroundColor: '#fef9c3',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  referralIconWrap: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  referralTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  },
  referralPromo: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  referralLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  referralCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 12,
  },
  referralCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  rewardsCard: {
    backgroundColor: '#f5f3ff',
    borderRadius: 20,
    paddingLeft: 0,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  rewardsCardDark: {
    backgroundColor: '#18181b',
  },
  tournamentsCard: {
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  tournamentsCardLast: {
    marginBottom: 0,
  },
  tournamentsCardImage: {
    borderRadius: 20,
  },
  tournamentsOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 60,
    borderRadius: 20,
  },
  tournamentsOverlay50: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  tournamentsContent: {
    alignItems: 'center',
  },
  tournamentsCenterText: {
    textAlign: 'center',
  },
  tournamentsTextWhite: {
    color: '#fff',
  },
  rewardsIconWrap: {
    marginBottom: 8,
  },
  rewardsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  rewardsTitleDark: {
    color: '#e4e4e7',
  },
  oneVOneSeason: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  oneVOnePoints: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  oneVOneRecord: {
    fontSize: 15,
    color: '#4b5563',
    marginBottom: 16,
  },
  oneVOneEmpty: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#e9e5ff',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#7c3aed',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  nextLevelText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  learnMoreBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  learnMoreGradient: {
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  learnMoreDisabled: {
    opacity: 0.7,
  },
  learnMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
