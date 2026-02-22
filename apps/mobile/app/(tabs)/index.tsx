import { useEffect, useState, useRef, useCallback } from 'react';
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
  Modal,
  Easing,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { useXp, xpForLevel, pointsForLevel, POINTS_PER_LEVEL } from '@/lib/xp-context';
import { DIVISION_NAMES } from '@trivora/core';
import { useResponsive, CONTENT_MAX_WIDTH } from '@/lib/responsive';

const PENDING_REFERRAL_KEY = 'trivora_pending_referral_code';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';


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

const COIN_FLY_DURATION = 650;
const COIN_FLY_STAGGER = 45;

function HomeFlyingCoin({
  id,
  startX,
  startY,
  endX,
  endY,
  index,
}: {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  index: number;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = index * COIN_FLY_STAGGER;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: endX - startX,
          duration: COIN_FLY_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: endY - startY,
          duration: COIN_FLY_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.35,
            duration: COIN_FLY_DURATION - 150,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(opacity, {
          toValue: 0,
          duration: COIN_FLY_DURATION * 0.85,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const size = 26;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.homeCoinWrap,
        {
          left: startX - size / 2,
          top: startY - size / 2,
          width: size,
          height: size,
          opacity,
          transform: [
            { translateX },
            { translateY },
            { scale },
          ],
        },
      ]}
    >
      <View style={styles.homeCoinCircle} />
    </Animated.View>
  );
}

export default function TabHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isTablet } = useResponsive();
  const { isDark } = useTheme();
  const { level, xp, pendingCoinsToFly, clearPendingCoinsToFly } = useXp();
  const [standing1v1, setStanding1v1] = useState<Standing1v1>(null);
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [rankDelta, setRankDelta] = useState<number | null>(null);
  const previousRankRef = useRef<number | null>(null);
  const rankDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [friendAcceptanceNotifications, setFriendAcceptanceNotifications] = useState<{ id: string; accepted_by_username: string }[]>([]);
  const [onlineFriendsCount, setOnlineFriendsCount] = useState(0);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [levelModalVisible, setLevelModalVisible] = useState(false);
  const [flyingCoins, setFlyingCoins] = useState<{ id: number; startX: number; startY: number; endX: number; endY: number }[]>([]);
  const [quickMatchLoading, setQuickMatchLoading] = useState(false);
  const [findingOpponentVisible, setFindingOpponentVisible] = useState(false);
  const [findingMessage, setFindingMessage] = useState('Finding opponent…');
  const [noMatchFoundVisible, setNoMatchFoundVisible] = useState(false);
  const [inviteMatchLoading, setInviteMatchLoading] = useState(false);
  const matchmakingStopRef = useRef<(() => void) | null>(null);
  const levelBadgeRef = useRef<View>(null);
  const playShakeX = useRef(new Animated.Value(0)).current;
  const sheenX = useRef(new Animated.Value(-100)).current;
  const dailySheenX = useRef(new Animated.Value(-120)).current;
  const onlineSheenX = useRef(new Animated.Value(-120)).current;
  const referralSheenX = useRef(new Animated.Value(-120)).current;
  const tournamentsSheenX = useRef(new Animated.Value(-120)).current;
  const quickFireSheenX = useRef(new Animated.Value(-120)).current;
  const leaderboardsSheenX = useRef(new Animated.Value(-120)).current;
  const levelSheenY = useRef(new Animated.Value(60)).current;
  const levelGlimmerOpacity = useRef(new Animated.Value(1)).current;
  const levelGlistenScale = useRef(new Animated.Value(1)).current;

  const runLevelSheen = useCallback(() => {
    levelSheenY.setValue(60);
    Animated.timing(levelSheenY, {
      toValue: -35,
      duration: 1200,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.ease),
    }).start();
  }, [levelSheenY]);

  useEffect(() => {
    runLevelSheen();
    const id = setInterval(runLevelSheen, 2800);
    return () => clearInterval(id);
  }, [runLevelSheen]);

  useEffect(() => {
    const glimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(levelGlimmerOpacity, {
          toValue: 0.88,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(levelGlimmerOpacity, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    glimmerLoop.start();
    return () => glimmerLoop.stop();
  }, [levelGlimmerOpacity]);

  useEffect(() => {
    const glistenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(levelGlistenScale, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(levelGlistenScale, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    glistenLoop.start();
    return () => glistenLoop.stop();
  }, [levelGlistenScale]);

  const runSheen = () => {
    sheenX.setValue(-100);
    Animated.timing(sheenX, {
      toValue: width + 100,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    const runDailySheen = () => {
      dailySheenX.setValue(-120);
      Animated.timing(dailySheenX, {
        toValue: width + 120,
        duration: 850,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    };
    runDailySheen();
    const id = setInterval(runDailySheen, 3800);
    return () => clearInterval(id);
  }, [width, dailySheenX]);

  useEffect(() => {
    const runOnlineSheen = () => {
      onlineSheenX.setValue(-120);
      Animated.timing(onlineSheenX, {
        toValue: width + 120,
        duration: 900,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    };
    runOnlineSheen();
    const id = setInterval(runOnlineSheen, 4000);
    return () => clearInterval(id);
  }, [width, onlineSheenX]);

  useEffect(() => {
    const runReferralSheen = () => {
      referralSheenX.setValue(-120);
      Animated.timing(referralSheenX, {
        toValue: width + 120,
        duration: 950,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    };
    runReferralSheen();
    const id = setInterval(runReferralSheen, 4500);
    return () => clearInterval(id);
  }, [width, referralSheenX]);

  useEffect(() => {
    const runTournamentsSheen = () => {
      tournamentsSheenX.setValue(-120);
      Animated.timing(tournamentsSheenX, {
        toValue: width + 120,
        duration: 880,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    };
    runTournamentsSheen();
    const id = setInterval(runTournamentsSheen, 4200);
    return () => clearInterval(id);
  }, [width, tournamentsSheenX]);

  useEffect(() => {
    const run = () => {
      quickFireSheenX.setValue(-120);
      Animated.timing(quickFireSheenX, { toValue: width + 120, duration: 860, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }).start();
    };
    run();
    const id = setInterval(run, 4100);
    return () => clearInterval(id);
  }, [width, quickFireSheenX]);

  useEffect(() => {
    const run = () => {
      leaderboardsSheenX.setValue(-120);
      Animated.timing(leaderboardsSheenX, { toValue: width + 120, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }).start();
    };
    run();
    const id = setInterval(run, 4300);
    return () => clearInterval(id);
  }, [width, leaderboardsSheenX]);

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

  const showLevelPopup = () => setLevelModalVisible(true);

  useFocusEffect(
    useCallback(() => {
      if (pendingCoinsToFly <= 0) return;
      const count = Math.min(pendingCoinsToFly, 12);
      clearPendingCoinsToFly();
      const timer = setTimeout(() => {
        const ref = levelBadgeRef.current as View & { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };
        if (ref?.measureInWindow) {
          ref.measureInWindow((bx: number, by: number, w: number, h: number) => {
            const endX = bx + w / 2;
            const endY = by + h / 2;
            setFlyingCoins(
              Array.from({ length: count }, (_, i) => ({
                id: Date.now() + i,
                startX: width / 2 + (i - count / 2) * 20,
                startY: height * 0.52,
                endX,
                endY,
              }))
            );
          });
        } else {
          const endX = width - 50;
          const endY = 85;
          setFlyingCoins(
            Array.from({ length: count }, (_, i) => ({
              id: Date.now() + i,
              startX: width / 2 + (i - count / 2) * 20,
              startY: height * 0.52,
              endX,
              endY,
            }))
          );
        }
      }, 350);
      return () => clearTimeout(timer);
    }, [pendingCoinsToFly, clearPendingCoinsToFly, width, height])
  );

  const QUICK_MATCH_TIMEOUT_MS = 20000;

  const handleQuickMatch = useCallback(async () => {
    if (quickMatchLoading) return;
    if (!SUPABASE_URL) {
      Alert.alert(
        'Not configured',
        'Supabase URL is missing. Add EXPO_PUBLIC_SUPABASE_URL to apps/mobile/.env and restart the app.',
      );
      return;
    }
    setQuickMatchLoading(true);
    setFindingOpponentVisible(true);
    setFindingMessage('Finding opponent…');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    let done = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const stopFinding = () => {
      if (done) return;
      done = true;
      realtimeChannel?.unsubscribe();
      matchmakingStopRef.current = null;
      setFindingOpponentVisible(false);
      setQuickMatchLoading(false);
    };
    matchmakingStopRef.current = stopFinding;

    const safetyTimeout = setTimeout(() => {
      stopFinding();
      setNoMatchFoundVisible(true);
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
        Alert.alert('No opponent yet', 'Try again in a moment or invite a friend.');
        return;
      }

      if (row.player_b) {
        clearTimeout(safetyTimeout);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        stopFinding();
        router.replace(`/match/${row.match_id}`);
        return;
      }

      setFindingMessage('Waiting for opponent to join…');
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
              router.replace(`/match/${row.match_id}`);
            }
          }
        )
        .subscribe();
    } catch (e: unknown) {
      stopFinding();
      clearTimeout(safetyTimeout);
      const msg =
        e instanceof Error && (e.message?.includes('fetch') || e.message?.includes('Network'))
          ? 'Network error. Check your connection.'
          : e instanceof Error
            ? e.message
            : 'Matchmaking failed';
      Alert.alert('Error', msg);
    }
  }, [quickMatchLoading, router]);

  const handleInviteMatch = useCallback(async () => {
    if (inviteMatchLoading) return;
    setInviteMatchLoading(true);
    try {
      const { data: matchId, error } = await supabase.rpc('create_invite_session');
      if (error) {
        Alert.alert('Error', error.message || 'Could not create session');
        return;
      }
      if (matchId) router.replace(`/match/${matchId}`);
    } catch (e) {
      Alert.alert('Error', 'Could not start invite session');
    } finally {
      setInviteMatchLoading(false);
    }
  }, [inviteMatchLoading, router]);

  const pointsInCurrentLevel = pointsForLevel(level);
  const xpInSegment = Math.min(pointsInCurrentLevel, Math.max(0, xp - xpForLevel(level)));
  const xpToNextLevel = pointsInCurrentLevel - xpInSegment;
  const progressToNext = pointsInCurrentLevel > 0 ? xpInSegment / pointsInCurrentLevel : 0;

  useEffect(() => {
    const userXp = xp ?? 0;
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('xp', userXp)
      .then(({ count }) => {
        const newRank = count != null ? count + 1 : null;
        if (newRank != null) {
          const prev = previousRankRef.current;
          if (prev != null && prev !== newRank) {
            const delta = prev - newRank;
            setRankDelta(delta);
            rankDeltaTimerRef.current && clearTimeout(rankDeltaTimerRef.current);
            rankDeltaTimerRef.current = setTimeout(() => setRankDelta(null), 60000);
          }
          previousRankRef.current = newRank;
        } else {
          previousRankRef.current = null;
        }
        setGlobalRank(newRank);
      });
    return () => {
      rankDeltaTimerRef.current && clearTimeout(rankDeltaTimerRef.current);
    };
  }, [xp]);

  const fetchFriendRequestCount = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const { count } = await supabase
      .from('friend_requests')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('status', 'pending');
    setFriendRequestCount(count ?? 0);
  }, []);

  const fetchFriendAcceptanceNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const { data } = await supabase
      .from('friend_acceptance_notifications')
      .select('id, accepted_by_username')
      .eq('user_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false });
    setFriendAcceptanceNotifications((data ?? []) as { id: string; accepted_by_username: string }[]);
  }, []);

  const fetchOnlineFriendsCount = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_friends_with_status');
    const list = (data ?? []) as { is_online?: boolean }[];
    const count = list.filter((f) => f.is_online === true).length;
    setOnlineFriendsCount(count);
  }, []);

  useEffect(() => {
    fetchFriendRequestCount();
    fetchFriendAcceptanceNotifications();
    fetchOnlineFriendsCount();
  }, [fetchFriendRequestCount, fetchFriendAcceptanceNotifications, fetchOnlineFriendsCount]);

  useFocusEffect(
    useCallback(() => {
      fetchFriendRequestCount();
      fetchFriendAcceptanceNotifications();
      fetchOnlineFriendsCount();
    }, [fetchFriendRequestCount, fetchFriendAcceptanceNotifications, fetchOnlineFriendsCount])
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
      supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.referral_code) setReferralCode(profile.referral_code);
        });
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

  useEffect(() => {
    SecureStore.getItemAsync(PENDING_REFERRAL_KEY).then((stored) => {
      if (!stored?.trim()) return;
      supabase.rpc('apply_referral', { p_referral_code: stored.trim() }).then(() => {
        SecureStore.deleteItemAsync(PENDING_REFERRAL_KEY);
      });
    });
  }, []);

  useEffect(() => {
    if (flyingCoins.length === 0) return;
    const t = setTimeout(() => setFlyingCoins([]), COIN_FLY_DURATION + flyingCoins.length * COIN_FLY_STAGGER + 400);
    return () => clearTimeout(t);
  }, [flyingCoins.length]);

  const copyReferralCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    Alert.alert('Copied!', 'Referral code copied to clipboard.');
  };

  const shareReferralCode = () => {
    if (!referralCode) return;
    Share.share({
      message: `Join me on Trivora! Use my referral code ${referralCode} when you sign up — I'll earn 500 XP when 3 friends join!`,
      title: 'Join Trivora',
    }).catch(() => {});
  };

  const rowPadding = 12;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header — game-style gradient bar */}
      <LinearGradient
        colors={isDark ? ['#1e1b4b', '#312e81', '#1e1b4b'] : ['#312e81', '#4c1d95', '#312e81']}
        style={[styles.headerGradient, { paddingTop: 15 + insets.top, paddingBottom: 10 }]}
      >
        <View style={styles.headerAccent} />
        <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Image source={require('@/assets/Logo.png')} style={styles.headerLogo} />
          <View style={styles.brandTextWrap}>
            <Text style={styles.appNameHeader} numberOfLines={1}>Trivora</Text>
            <Text style={styles.taglineHeader} numberOfLines={1}>Outthink. Outplay. Outrank.</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {globalRank != null && (
            <Pressable
              style={styles.globalRankBadgeHeader}
              onPress={() => router.push({ pathname: '/(tabs)/leaderboards', params: { scrollToMe: '1' } } as any)}
              hitSlop={8}
            >
              <Ionicons name="trophy" size={18} color="#fbbf24" />
              <Text style={styles.globalRankTextHeader} numberOfLines={1}>#{globalRank}</Text>
              {rankDelta != null && rankDelta !== 0 && (
                <Text style={[styles.rankDelta, rankDelta > 0 ? styles.rankDeltaUp : styles.rankDeltaDown]} numberOfLines={1}>
                  {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
                </Text>
              )}
            </Pressable>
          )}
          <Pressable onPress={showLevelPopup} style={styles.levelButton} hitSlop={6}>
            <View style={styles.levelFlameWrap}>
              <Animated.View
                style={[styles.levelIconSheen, { transform: [{ translateY: levelSheenY }] }]}
                pointerEvents="none"
              >
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)', 'transparent']}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 0, y: 0 }}
                  style={styles.levelIconSheenGradient}
                />
              </Animated.View>
              <Animated.View ref={levelBadgeRef} style={[styles.levelNumberWrap, { transform: [{ scale: levelGlistenScale }], opacity: levelGlimmerOpacity }]} collapsable={false}>
                <View style={styles.levelBadgeOuter}>
                  <LinearGradient
                    colors={['#a78bfa', '#7c3aed', '#5b21b6', '#4c1d95']}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={[styles.levelNumberBadge, level >= 10 && styles.levelNumberBadgeWide, level >= 100 && styles.levelNumberBadgeWider]}
                  >
                    <View style={styles.levelBadgeInnerHighlight} pointerEvents="none" />
                    <View style={styles.levelBadgeContent}>
                      <Text style={styles.levelBadgeLabel}>LVL</Text>
                      <Text style={[
                        styles.levelNumberText,
                        level >= 10 && styles.levelNumberTextSmall,
                        level >= 100 && styles.levelNumberTextTiny,
                      ]} numberOfLines={1}>
                        {level}
                      </Text>
                    </View>
                  </LinearGradient>
                </View>
              </Animated.View>
            </View>
          </Pressable>
          <Pressable
            onPress={async () => {
              if (friendAcceptanceNotifications.length > 0) {
                const message =
                  friendAcceptanceNotifications.length === 1
                    ? `@${friendAcceptanceNotifications[0].accepted_by_username} has accepted your friend request.`
                    : friendAcceptanceNotifications.map((n) => `@${n.accepted_by_username}`).join(', ') + ' have accepted your friend requests.';
                Alert.alert('Friend request accepted', message, [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await supabase.rpc('mark_friend_acceptance_notifications_read');
                      setFriendAcceptanceNotifications([]);
                      router.push('/profile/friends');
                    },
                  },
                ]);
              } else {
                router.push('/profile/friends');
              }
            }}
            style={styles.notificationIconButton}
            hitSlop={6}
          >
            <Ionicons name="people-outline" size={26} color="#e4e4e7" />
            {(friendRequestCount > 0 || friendAcceptanceNotifications.length > 0) && (
              <View style={[styles.notificationBadge, (friendRequestCount + friendAcceptanceNotifications.length) > 9 && styles.notificationBadgeWide]}>
                <Text style={styles.notificationBadgeText}>
                  {friendRequestCount + friendAcceptanceNotifications.length > 99 ? '99+' : friendRequestCount + friendAcceptanceNotifications.length}
                </Text>
              </View>
            )}
            {onlineFriendsCount > 0 && (
              <View style={styles.onlineFriendsBadge}>
                <Text style={styles.onlineFriendsBadgeText} numberOfLines={1}>
                  {onlineFriendsCount > 99 ? '99+' : onlineFriendsCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 0 },
          isTablet && { alignItems: 'center' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.scrollContentInner, isTablet && { maxWidth: CONTENT_MAX_WIDTH, width: '100%' }]}>
        {/* Hero strip — game hub feel */}
        <LinearGradient
          colors={isDark ? ['#1e1b4b', '#0f0a1f'] : ['#4c1d95', '#1e1b4b']}
          style={styles.homeHeroGradient}
        >
          <View style={styles.homeHeroAccent} />
          <Text style={styles.homeHeroLabel}>YOUR HUB</Text>
          <Text style={styles.homeHeroTitle}>Jump in and play</Text>
          <Text style={styles.homeHeroSubtitle}>Daily · 1v1 · Tournaments · Quick Fire · More</Text>
        </LinearGradient>

        {/* Today's Daily Quiz — AAA-style hero card */}
        <View style={styles.dailyCardWrap}>
          <View style={styles.dailyCardInner}>
            <LinearGradient
              colors={isDark ? ['#1e1b4b', '#312e81', '#1e1b4b'] : ['#4c1d95', '#5b21b6', '#4c1d95']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.dailyCard}
            >
              <View style={styles.dailyCardAccent} />
              <View style={styles.dailyCardContent}>
                <View style={styles.dailyCardHeader}>
                  <View style={styles.dailyCardIconRing}>
                    <View style={styles.dailyCardIconInner}>
                      <Ionicons name="calendar" size={26} color="rgba(255,255,255,0.95)" />
                    </View>
                  </View>
                  <View style={styles.dailyCardTitles}>
                    <Text style={styles.dailyCardHeadline}>DAILY QUIZ</Text>
                    <Text style={styles.dailyCardTagline}>10 questions · 10 subjects · {getCalendarDate().month} {getCalendarDate().day}</Text>
                  </View>
                </View>
                <View style={styles.dailyCardButtons}>
                  <Link href="/quiz/daily/play" asChild>
                    <Pressable
                      style={({ pressed }) => [styles.dailyPrimaryBtn, pressed && styles.dailyBtnPressed]}
                      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    >
                      <LinearGradient colors={['#fff', '#e9d5ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dailyPrimaryBtnGradient}>
                        <Ionicons name="play" size={20} color="#5b21b6" style={styles.dailyBtnIcon} />
                        <Text style={styles.dailyPrimaryBtnText}>Play Now</Text>
                      </LinearGradient>
                    </Pressable>
                  </Link>
                  <Link href="/leaderboards/daily" asChild>
                    <Pressable
                      style={({ pressed }) => [styles.dailySecondaryBtn, pressed && styles.dailyBtnPressed]}
                      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    >
                      <Ionicons name="podium" size={20} color="rgba(255,255,255,0.95)" style={styles.dailyBtnIcon} />
                      <Text style={styles.dailySecondaryBtnText}>Today&apos;s Leaderboard</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>
            </LinearGradient>
            <Animated.View style={[styles.dailyCardSheen, { transform: [{ translateX: dailySheenX }] }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dailyCardSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Online game — AAA-style hero card */}
        <View style={styles.onlineCardWrap}>
          <View style={styles.onlineCardInner}>
            <LinearGradient
              colors={isDark ? ['#1e1b4b', '#312e81', '#1e1b4b'] : ['#4c1d95', '#5b21b6', '#4c1d95']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.onlineCard}
            >
              <View style={styles.onlineCardAccent} />
              <View style={styles.onlineCardContent}>
                <View style={styles.onlineCardHeader}>
                  <View style={styles.onlineCardIconRing}>
                    <View style={styles.onlineCardIconInner}>
                      <Ionicons name="people" size={26} color="rgba(255,255,255,0.95)" />
                    </View>
                  </View>
                  <View style={styles.onlineCardTitles}>
                    <Text style={styles.onlineCardHeadline}>1v1 BATTLE</Text>
                    <Text style={styles.onlineCardTagline}>Find a rival or invite a friend</Text>
                    {onlineFriendsCount > 0 && (
                      <View style={styles.onlineCardLivePill}>
                        <View style={styles.onlineCardLiveDot} />
                        <Text style={styles.onlineCardLiveText}>{onlineFriendsCount} friend{onlineFriendsCount !== 1 ? 's' : ''} online</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.onlineCardButtons}>
                  <Pressable
                    style={({ pressed }) => [styles.onlinePrimaryBtn, quickMatchLoading && styles.onlineBtnDisabled, pressed && styles.onlineBtnPressed]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleQuickMatch(); }}
                    disabled={quickMatchLoading}
                  >
                    <LinearGradient colors={['#fff', '#e9d5ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.onlinePrimaryBtnGradient}>
                      {quickMatchLoading ? (
                        <ActivityIndicator color="#5b21b6" size="small" />
                      ) : (
                        <>
                          <Ionicons name="flash" size={20} color="#5b21b6" style={styles.onlineBtnIcon} />
                          <Text style={styles.onlinePrimaryBtnText}>Quick match</Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.onlineSecondaryBtn, inviteMatchLoading && styles.onlineBtnDisabled, pressed && styles.onlineBtnPressed]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleInviteMatch(); }}
                    disabled={inviteMatchLoading}
                  >
                    {inviteMatchLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="person-add" size={20} color="rgba(255,255,255,0.95)" style={styles.onlineBtnIcon} />
                        <Text style={styles.onlineSecondaryBtnText}>Invite match</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </LinearGradient>
            <Animated.View style={[styles.onlineCardSheen, { transform: [{ translateX: onlineSheenX }] }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.onlineCardSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Invite & earn rewards — AAA-style hero card */}
        <View style={styles.referralCardWrap}>
          <View style={styles.referralCardInner}>
            <LinearGradient
              colors={isDark ? ['#422006', '#78350f', '#422006'] : ['#78350f', '#b45309', '#92400e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.referralCard}
            >
              <View style={styles.referralCardAccent} />
              <View style={styles.referralCardContent}>
                <View style={styles.referralCardHeader}>
                  <View style={styles.referralCardIconRing}>
                    <View style={styles.referralCardIconInner}>
                      <Ionicons name="medal" size={26} color="rgba(255,255,255,0.95)" />
                    </View>
                  </View>
                  <View style={styles.referralCardTitles}>
                    <Text style={styles.referralCardHeadline}>INVITE & EARN</Text>
                    <Text style={styles.referralCardTagline}>Refer 3 friends · Get 500 XP</Text>
                  </View>
                </View>
                <View style={styles.referralCodeBlock}>
                  <Text style={styles.referralCodeLabel}>Your code</Text>
                  <Pressable
                    style={({ pressed }) => [styles.referralCodePill, !referralCode && styles.referralCodePillDisabled, pressed && styles.referralBtnPressed]}
                    onPress={() => { if (referralCode) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); copyReferralCode(); } }}
                    disabled={!referralCode}
                  >
                    <Text style={styles.referralCodePillText} numberOfLines={1}>{referralCode ?? '…'}</Text>
                    <Ionicons name="copy-outline" size={20} color="rgba(255,255,255,0.95)" />
                  </Pressable>
                </View>
                <View style={styles.referralCardButtons}>
                  <Pressable
                    style={({ pressed }) => [styles.referralPrimaryBtn, !referralCode && styles.referralBtnDisabled, pressed && styles.referralBtnPressed]}
                    onPress={() => { if (referralCode) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); copyReferralCode(); } }}
                    disabled={!referralCode}
                  >
                    <LinearGradient colors={['#fff', '#fef3c7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.referralPrimaryBtnGradient}>
                      <Ionicons name="copy" size={20} color="#b45309" style={styles.referralBtnIcon} />
                      <Text style={styles.referralPrimaryBtnText}>Copy code</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.referralSecondaryBtn, !referralCode && styles.referralBtnDisabled, pressed && styles.referralBtnPressed]}
                    onPress={() => { if (referralCode) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); shareReferralCode(); } }}
                    disabled={!referralCode}
                  >
                    <Ionicons name="share-social" size={20} color="rgba(255,255,255,0.95)" style={styles.referralBtnIcon} />
                    <Text style={styles.referralSecondaryBtnText}>Share</Text>
                  </Pressable>
                </View>
              </View>
            </LinearGradient>
            <Animated.View style={[styles.referralCardSheen, { transform: [{ translateX: referralSheenX }] }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.referralCardSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Tournaments — AAA-style hero card */}
        <View style={styles.tournamentsHeroWrap}>
          <View style={styles.tournamentsHeroInner}>
            <Pressable
              style={({ pressed }) => [pressed && styles.tournamentsHeroPressed]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/modes/tournaments'); }}
            >
              <LinearGradient
                colors={isDark ? ['#0c4a6e', '#075985', '#0c4a6e'] : ['#0369a1', '#0284c7', '#0369a1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tournamentsHeroCard}
              >
                <View style={styles.tournamentsHeroAccent} />
                <View style={styles.tournamentsHeroContent}>
                  <View style={styles.tournamentsHeroHeader}>
                    <View style={styles.tournamentsHeroIconRing}>
                      <View style={styles.tournamentsHeroIconInner}>
                        <Ionicons name="trophy" size={26} color="rgba(255,255,255,0.95)" />
                      </View>
                    </View>
                    <View style={styles.tournamentsHeroTitles}>
                      <Text style={styles.tournamentsHeroHeadline}>TOURNAMENTS</Text>
                      <Text style={styles.tournamentsHeroTagline}>Global Quiz · Top 16 → Live Finals</Text>
                    </View>
                  </View>
                  <View style={styles.tournamentsHeroCta}>
                    <Text style={styles.tournamentsHeroCtaText}>View upcoming</Text>
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.95)" />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
            <Animated.View style={[styles.tournamentsHeroSheen, { transform: [{ translateX: tournamentsSheenX }] }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tournamentsHeroSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Quick Fire 10 — AAA-style hero card */}
        <View style={styles.quickFireHeroWrap}>
          <View style={styles.quickFireHeroInner}>
            <Pressable
              style={({ pressed }) => [pressed && styles.quickFireHeroPressed]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/modes/quick-fire'); }}
            >
              <LinearGradient
                colors={isDark ? ['#431407', '#7c2d12', '#431407'] : ['#c2410c', '#ea580c', '#b45309']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickFireHeroCard}
              >
                <View style={styles.quickFireHeroAccent} />
                <View style={styles.quickFireHeroContent}>
                  <View style={styles.quickFireHeroHeader}>
                    <View style={styles.quickFireHeroIconRing}>
                      <View style={styles.quickFireHeroIconInner}>
                        <Ionicons name="flash" size={26} color="rgba(255,255,255,0.95)" />
                      </View>
                    </View>
                    <View style={styles.quickFireHeroTitles}>
                      <Text style={styles.quickFireHeroHeadline}>QUICK FIRE 10</Text>
                      <Text style={styles.quickFireHeroTagline}>10 questions, 60 seconds. Are you quick enough?</Text>
                    </View>
                  </View>
                  <View style={styles.quickFireHeroCta}>
                    <Text style={styles.quickFireHeroCtaText}>Play</Text>
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.95)" />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
            <Animated.View style={[styles.quickFireHeroSheen, { transform: [{ translateX: quickFireSheenX }] }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickFireHeroSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        {/* Leaderboards — AAA-style hero card */}
        <View style={styles.leaderboardsHeroWrap}>
          <View style={styles.leaderboardsHeroInner}>
            <Pressable
              style={({ pressed }) => [pressed && styles.leaderboardsHeroPressed]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/leaderboards'); }}
            >
              <LinearGradient
                colors={isDark ? ['#052e16', '#14532d', '#052e16'] : ['#047857', '#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.leaderboardsHeroCard}
              >
                <View style={styles.leaderboardsHeroAccent} />
                <View style={styles.leaderboardsHeroContent}>
                  <View style={styles.leaderboardsHeroHeader}>
                    <View style={styles.leaderboardsHeroIconRing}>
                      <View style={styles.leaderboardsHeroIconInner}>
                        <Ionicons name="podium" size={26} color="rgba(255,255,255,0.95)" />
                      </View>
                    </View>
                    <View style={styles.leaderboardsHeroTitles}>
                      <Text style={styles.leaderboardsHeroHeadline}>LEADERBOARDS</Text>
                      <Text style={styles.leaderboardsHeroTagline}>Climb the ranks. Be the best.</Text>
                    </View>
                  </View>
                  <View style={styles.leaderboardsHeroCta}>
                    <Text style={styles.leaderboardsHeroCtaText}>View</Text>
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.95)" />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
            <Animated.View style={[styles.leaderboardsHeroSheen, { transform: [{ translateX: leaderboardsSheenX }] }]} pointerEvents="none">
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.leaderboardsHeroSheenGradient}
              />
            </Animated.View>
          </View>
        </View>

        <Pressable style={[styles.ideaCta, isDark && styles.ideaCtaDark]} onPress={() => router.push('/contact')}>
          <Text style={[styles.ideaCtaText, isDark && styles.ideaCtaTextDark]}>Do you have an idea? Tell us here.</Text>
        </Pressable>

        <View style={styles.footerRow}>
          <View style={styles.footerSocial}>
            <Pressable onPress={() => Linking.openURL('https://www.instagram.com/mahanlankarani/').catch(() => {})} style={styles.footerSocialBtn}>
              <Ionicons name="logo-instagram" size={28} color="#a78bfa" />
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://www.tiktok.com/@mahanlankarani?lang=en').catch(() => {})} style={styles.footerSocialBtn}>
              <Ionicons name="logo-tiktok" size={26} color="#a78bfa" />
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://www.etsy.com/listing/4427244906/is-your-general-knowledge-above-average?etsrc=sdt').catch(() => {})} style={styles.footerSocialBtn}>
              <Ionicons name="book-outline" size={26} color="#a78bfa" />
            </Pressable>
          </View>
          <View style={styles.footerLogo}>
            <Image source={require('@/assets/Logo.png')} style={styles.footerLogoImage} resizeMode="contain" />
          </View>
        </View>
        </View>
      </ScrollView>

      {flyingCoins.length > 0 && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="none">
          {flyingCoins.map((coin, i) => (
            <HomeFlyingCoin
              key={coin.id}
              id={coin.id}
              startX={coin.startX}
              startY={coin.startY}
              endX={coin.endX}
              endY={coin.endY}
              index={i}
            />
          ))}
        </View>
      )}

      <Modal
        visible={levelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLevelModalVisible(false)}
      >
        <Pressable style={styles.levelModalBackdrop} onPress={() => setLevelModalVisible(false)}>
          <Pressable style={styles.levelModalCard} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={['#1e1b4b', '#312e81', '#1e1b4b']}
              style={styles.levelModalGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.levelModalShine} />
              <View style={styles.levelModalContent}>
                <View style={styles.levelModalHeader}>
                  <View style={styles.levelModalStarWrap}>
                    <Ionicons name="star" size={28} color="#fbbf24" />
                  </View>
                  <Text style={styles.levelModalTitle}>Level {level}</Text>
                  <Text style={styles.levelModalSub}>Total XP: {xp}</Text>
                </View>
                <View style={styles.levelModalBarSection}>
                  <View style={styles.levelModalBarLabels}>
                    <Text style={styles.levelModalBarCurrent}>{xpInSegment} / {pointsInCurrentLevel} XP</Text>
                    <Text style={styles.levelModalBarNext}>{xpToNextLevel} to Level {level + 1}</Text>
                  </View>
                  <View style={styles.levelModalBarTrack}>
                    <View style={styles.levelModalBarGlow} />
                    <View style={[styles.levelModalBarFillWrap, { width: `${progressToNext * 100}%` }]}>
                      <LinearGradient
                        colors={['#fcd34d', '#f59e0b', '#d97706']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.levelModalBarFillShine} />
                    </View>
                  </View>
                </View>
                <View style={styles.levelModalCoinsRow}>
                  <View style={styles.levelModalCoinIcon} />
                  <Text style={styles.levelModalCoinsCopy}>2 XP per correct · +25 for 10/10</Text>
                </View>
                <Text style={styles.levelModalCta}>Keep playing to level up!</Text>
                <Pressable style={styles.levelModalCloseBtn} onPress={() => setLevelModalVisible(false)}>
                  <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.levelModalCloseGradient}>
                    <Text style={styles.levelModalCloseText}>Got it</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={findingOpponentVisible || noMatchFoundVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.findingOpponentBackdrop} pointerEvents="box-none">
          <View style={styles.findingOpponentCard}>
            <Text style={styles.findingOpponentLabel}>QUICK MATCH</Text>
            {noMatchFoundVisible ? (
              <>
                <Text style={styles.findingOpponentTitle}>No match found</Text>
                <Text style={styles.findingOpponentSub}>Sorry we could not find you a match. Please try again.</Text>
                <Pressable
                  style={styles.findingOpponentCancelBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setNoMatchFoundVisible(false);
                  }}
                >
                  <Text style={styles.findingOpponentCancelText}>Try again</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color="#a78bfa" style={styles.findingOpponentSpinner} />
                <Text style={styles.findingOpponentTitle}>{findingMessage}</Text>
                <Text style={styles.findingOpponentSub}>Same 10 questions for both · 60 sec each · highest score wins</Text>
                <Pressable
                  style={styles.findingOpponentCancelBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    matchmakingStopRef.current?.();
                    setFindingOpponentVisible(false);
                    setQuickMatchLoading(false);
                  }}
                >
                  <Text style={styles.findingOpponentCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0a1f',
  },
  containerDark: { backgroundColor: '#0c0a14' },
  headerGradient: {
    paddingHorizontal: 14,
  },
  headerAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(167, 139, 250, 0.6)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  headerLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  brandTextWrap: { flex: 1, minWidth: 0 },
  appNameHeader: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  taglineHeader: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  globalRankBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
  },
  globalRankTextHeader: { fontSize: 12, fontWeight: '700', color: '#fbbf24' },
  rankDelta: { fontSize: 10, fontWeight: '800', marginLeft: 2 },
  rankDeltaUp: { color: '#22c55e' },
  rankDeltaDown: { color: '#ef4444' },
  notificationIconButton: {
    position: 'relative',
    padding: 2,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeWide: { minWidth: 18, paddingHorizontal: 3 },
  notificationBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  onlineFriendsBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  onlineFriendsBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  levelButton: {
    padding: 2,
  },
  levelFlameWrap: {
    position: 'relative',
    width: 46,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  levelIconSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 46,
    height: 26,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 1,
  },
  levelIconSheenGradient: {
    flex: 1,
    width: 46,
    height: 26,
    borderRadius: 14,
  },
  levelNumberWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeOuter: {
    padding: 2,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  levelNumberBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  levelNumberBadgeWide: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  levelNumberBadgeWider: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  levelBadgeInnerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  levelBadgeContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.8,
    marginBottom: -1,
  },
  levelNumberText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  levelNumberTextSmall: {
    fontSize: 16,
  },
  levelNumberTextTiny: {
    fontSize: 13,
  },
  homeCoinWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeCoinCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fbbf24',
    borderWidth: 2,
    borderColor: '#fcd34d',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 6,
  },
  findingOpponentBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  findingOpponentCard: {
    backgroundColor: '#1e1b4b',
    borderRadius: 20,
    padding: 32,
    minWidth: 260,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(124, 58, 237, 0.5)',
  },
  findingOpponentLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#a78bfa',
    marginBottom: 12,
    textAlign: 'center',
  },
  findingOpponentSpinner: { marginBottom: 16 },
  findingOpponentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e9d5ff',
    marginBottom: 6,
    textAlign: 'center',
  },
  findingOpponentSub: {
    fontSize: 14,
    color: '#a78bfa',
    marginBottom: 20,
    textAlign: 'center',
  },
  findingOpponentCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  findingOpponentCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c4b5fd',
  },
  levelModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  levelModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  levelModalGradient: {
    borderRadius: 24,
    padding: 28,
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    overflow: 'hidden',
  },
  levelModalShine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderTopLeftRadius: 22,
    width: '80%',
    height: '40%',
  },
  levelModalContent: { alignItems: 'center' },
  levelModalHeader: { alignItems: 'center', marginBottom: 24 },
  levelModalStarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    borderWidth: 2,
    borderColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  levelModalTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fbbf24',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  levelModalSub: {
    fontSize: 15,
    color: '#c4b5fd',
    marginTop: 4,
    fontWeight: '600',
  },
  levelModalBarSection: { width: '100%', marginBottom: 20 },
  levelModalBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  levelModalBarCurrent: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fcd34d',
  },
  levelModalBarNext: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a78bfa',
  },
  levelModalBarTrack: {
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  levelModalBarGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 10,
  },
  levelModalBarFillWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  levelModalBarFillShine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 7,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  levelModalCoinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  levelModalCoinIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fbbf24',
    borderWidth: 2,
    borderColor: '#fcd34d',
  },
  levelModalCoinsCopy: {
    fontSize: 14,
    color: '#c4b5fd',
    fontWeight: '600',
  },
  levelModalCta: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e9d5ff',
    marginBottom: 20,
  },
  levelModalCloseBtn: {
    alignSelf: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
  },
  levelModalCloseGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  levelModalCloseText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e1b4b',
  },
  iconButton: {
    padding: 4,
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 20,
    alignItems: 'stretch',
  },
  scrollContentInner: {
    width: '100%',
  },
  homeHeroGradient: {
    marginHorizontal: -20,
    marginBottom: 24,
    paddingVertical: 20,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  homeHeroAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: '#a78bfa',
  },
  homeHeroLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  homeHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  homeHeroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  ideaCta: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  ideaCtaDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  ideaCtaText: {
    fontSize: 14,
    color: '#a78bfa',
    fontWeight: '600',
  },
  ideaCtaTextDark: {
    color: '#c4b5fd',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 0,
  },
  footerLogo: {
    marginBottom: 0,
  },
  footerLogoImage: {
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
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
  dailyCardInner: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  dailyCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    paddingLeft: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  dailyCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(196, 181, 253, 0.9)',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  dailyCardContent: {
    paddingLeft: 8,
  },
  dailyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 14,
  },
  dailyCardIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(167, 139, 250, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyCardIconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyCardTitles: {
    flex: 1,
  },
  dailyCardHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dailyCardTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  dailyCardButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  dailyPrimaryBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dailyPrimaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  dailyPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#5b21b6',
  },
  dailySecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  dailySecondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  dailyBtnIcon: {
    marginRight: 0,
  },
  dailyBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  dailyCardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 120,
    borderRadius: 22,
    overflow: 'hidden',
  },
  dailyCardSheenGradient: {
    flex: 1,
    width: 120,
    borderRadius: 22,
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
  onlineCardWrap: {
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
  },
  onlineCardInner: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  onlineCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    paddingLeft: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  onlineCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(196, 181, 253, 0.9)',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  onlineCardContent: {
    paddingLeft: 8,
  },
  onlineCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 14,
  },
  onlineCardIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(167, 139, 250, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(196, 181, 253, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineCardIconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineCardTitles: {
    flex: 1,
  },
  onlineCardHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  onlineCardTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  onlineCardLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.5)',
  },
  onlineCardLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  onlineCardLiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  onlineCardButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  onlinePrimaryBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  onlinePrimaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  onlinePrimaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#5b21b6',
  },
  onlineSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  onlineSecondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  onlineBtnIcon: {
    marginRight: 0,
  },
  onlineBtnDisabled: {
    opacity: 0.7,
  },
  onlineBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  onlineCardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 120,
    borderRadius: 22,
    overflow: 'hidden',
  },
  onlineCardSheenGradient: {
    flex: 1,
    width: 120,
    borderRadius: 22,
  },
  referralCardWrap: {
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  referralCardInner: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  referralCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    paddingLeft: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  referralCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(253, 224, 71, 0.9)',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  referralCardContent: {
    paddingLeft: 8,
  },
  referralCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 14,
  },
  referralCardIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(251, 191, 36, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(253, 224, 71, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralCardIconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralCardTitles: {
    flex: 1,
  },
  referralCardHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  referralCardTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  referralCodeBlock: {
    marginBottom: 14,
  },
  referralCodeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  referralCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 10,
  },
  referralCodePillDisabled: {
    opacity: 0.6,
  },
  referralCodePillText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    flex: 1,
  },
  referralCardButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  referralPrimaryBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  referralPrimaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  referralPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#b45309',
  },
  referralSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  referralSecondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  referralBtnIcon: {
    marginRight: 0,
  },
  referralBtnDisabled: {
    opacity: 0.6,
  },
  referralBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  referralCardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 120,
    borderRadius: 22,
    overflow: 'hidden',
  },
  referralCardSheenGradient: {
    flex: 1,
    width: 120,
    borderRadius: 22,
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
  tournamentsHeroWrap: {
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  tournamentsHeroInner: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  tournamentsHeroPressed: {
    opacity: 0.95,
  },
  tournamentsHeroCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    paddingLeft: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  tournamentsHeroAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(125, 211, 252, 0.9)',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  tournamentsHeroContent: {
    paddingLeft: 8,
  },
  tournamentsHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 14,
  },
  tournamentsHeroIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(125, 211, 252, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tournamentsHeroIconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tournamentsHeroTitles: {
    flex: 1,
  },
  tournamentsHeroHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tournamentsHeroTagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  tournamentsHeroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  tournamentsHeroCtaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  tournamentsHeroSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 120,
    borderRadius: 22,
    overflow: 'hidden',
  },
  tournamentsHeroSheenGradient: {
    flex: 1,
    width: 120,
    borderRadius: 22,
  },
  quickFireHeroWrap: {
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  quickFireHeroInner: { borderRadius: 22, overflow: 'hidden', position: 'relative' },
  quickFireHeroPressed: { opacity: 0.95 },
  quickFireHeroCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    paddingLeft: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.4)',
  },
  quickFireHeroAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
    backgroundColor: 'rgba(253, 186, 116, 0.9)',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  quickFireHeroContent: { paddingLeft: 8 },
  quickFireHeroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  quickFireHeroIconRing: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(251, 146, 60, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(253, 186, 116, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickFireHeroIconInner: { alignItems: 'center', justifyContent: 'center' },
  quickFireHeroTitles: { flex: 1 },
  quickFireHeroHeadline: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.5, marginBottom: 2 },
  quickFireHeroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  quickFireHeroCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  quickFireHeroCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  quickFireHeroSheen: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 120, borderRadius: 22, overflow: 'hidden' },
  quickFireHeroSheenGradient: { flex: 1, width: 120, borderRadius: 22 },
  leaderboardsHeroWrap: {
    marginBottom: 16,
    borderRadius: 22,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  leaderboardsHeroInner: { borderRadius: 22, overflow: 'hidden', position: 'relative' },
  leaderboardsHeroPressed: { opacity: 0.95 },
  leaderboardsHeroCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    paddingLeft: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  leaderboardsHeroAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
    backgroundColor: 'rgba(134, 239, 172, 0.9)',
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  leaderboardsHeroContent: { paddingLeft: 8 },
  leaderboardsHeroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  leaderboardsHeroIconRing: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(52, 211, 153, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(134, 239, 172, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardsHeroIconInner: { alignItems: 'center', justifyContent: 'center' },
  leaderboardsHeroTitles: { flex: 1 },
  leaderboardsHeroHeadline: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.5, marginBottom: 2 },
  leaderboardsHeroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  leaderboardsHeroCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  leaderboardsHeroCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  leaderboardsHeroSheen: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 120, borderRadius: 22, overflow: 'hidden' },
  leaderboardsHeroSheenGradient: { flex: 1, width: 120, borderRadius: 22 },
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
