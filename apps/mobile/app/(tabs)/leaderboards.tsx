import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Modal, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { useResponsive, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { countryCodeToName, countryToFlagEmoji } from '@/lib/country';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

type ProfileCardData = {
  user_id: string;
  username: string;
  global_rank?: number | null;
  live_quiz_win_count?: number;
  live_quizzes_participated?: number;
  live_quiz_top_10_finishes?: number;
  joined_at: string;
  total_quizzes_completed: number;
  total_wins: number;
  total_draws: number;
  total_losses: number;
  total_questions_correct: number;
  total_questions_incorrect: number;
  xp: number;
  level: number;
  country?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

type LeaderboardRow = {
  user_id: string;
  rank: number;
  xp: number;
  level: number;
  wins: number;
  draws: number;
  losses: number;
};

type DailyLeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  score: number;
  live_quiz_win_count?: number;
};

const DAILY_LEADERBOARD_TOP = 10;

export type LeaderboardFilter = 'global' | 'country' | 'friends';

export default function LeaderboardsTab() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { isTablet } = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollToMe?: string }>();
  const listRef = useRef<FlatList>(null);
  const scrollToMeDoneRef = useRef(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeaderboardFilter>('global');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileCountries, setProfileCountries] = useState<Record<string, string | null>>({});
  const [dailyRows, setDailyRows] = useState<DailyLeaderboardRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cardData, setCardData] = useState<ProfileCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'xp' | 'wins'>('xp');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const displayRows = useMemo(() => {
    if (sortBy === 'wins') {
      return [...rows]
        .sort((a, b) => b.wins - a.wins)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }
    return rows;
  }, [rows, sortBy]);

  const fetchDailyLeaderboard = useCallback(async () => {
    setDailyLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('get_daily_quiz_leaderboard', { p_limit: filter === 'global' ? DAILY_LEADERBOARD_TOP : 300 });
    setDailyLoading(false);
    let list = (data ?? []) as DailyLeaderboardRow[];
    if (!error && list.length > 0 && filter !== 'global') {
      if (filter === 'country' && user?.id) {
        const { data: myProfile } = await supabase.from('profiles').select('country').eq('id', user.id).single();
        const myCountry = (myProfile as { country?: string | null } | null)?.country;
        if (myCountry) {
          const ids = list.map((r) => r.user_id);
          const { data: profs } = await supabase.from('profiles').select('id, country').in('id', ids);
          const byCountry = new Set((profs ?? []).filter((p: { country?: string | null }) => p.country === myCountry).map((p: { id: string }) => p.id));
          list = list.filter((r) => byCountry.has(r.user_id)).map((r, i) => ({ ...r, rank: i + 1 }));
        }
      } else if (filter === 'friends' && user?.id) {
        const { data: friendsData } = await supabase.rpc('get_my_friends_with_status');
        const friendIds = new Set((friendsData ?? []).map((f: { friend_id: string }) => f.friend_id));
        friendIds.add(user.id);
        list = list.filter((r) => friendIds.has(r.user_id)).map((r, i) => ({ ...r, rank: i + 1 }));
      }
    }
    setDailyRows(list);
  }, [filter]);

  const fetchLeaderboard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    let query = supabase
      .from('profiles')
      .select('id, username, display_name, xp, level, country, live_quiz_win_count')
      .order('xp', { ascending: false });

    if (filter === 'country' && user?.id) {
      const { data: myProfile } = await supabase.from('profiles').select('country').eq('id', user.id).single();
      const myCountry = (myProfile as { country?: string | null } | null)?.country;
      if (myCountry) query = query.eq('country', myCountry);
    } else if (filter === 'friends' && user?.id) {
      const { data: friendsData } = await supabase.rpc('get_my_friends_with_status');
      const friendIds = (friendsData ?? []).map((f: { friend_id: string }) => f.friend_id);
      friendIds.push(user.id);
      if (friendIds.length === 0) {
        setRows([]);
        setProfiles({});
        setProfileCountries({});
        return;
      }
      query = query.in('id', friendIds);
    }

    const { data: profilesData } = await query.range(0, 99);
    const list = (profilesData ?? []) as { id: string; username?: string; display_name?: string; xp?: number; level?: number; country?: string | null; live_quiz_win_count?: number }[];
    setHasMore(list.length >= 100);

    const userIds = list.map((p) => p.id);

    const standingRows: { user_id: string; wins: number; draws: number; losses: number }[] = [];
    if (userIds.length > 0) {
      const { data: standingsData } = await supabase
        .from('standings')
        .select('user_id, wins, draws, losses')
        .in('user_id', userIds);
      const standings = (standingsData ?? []) as { user_id: string; wins: number; draws: number; losses: number }[];
      const byUser: Record<string, { wins: number; draws: number; losses: number }> = {};
      standings.forEach((s) => {
        if (!byUser[s.user_id]) byUser[s.user_id] = { wins: 0, draws: 0, losses: 0 };
        byUser[s.user_id].wins += s.wins ?? 0;
        byUser[s.user_id].draws += s.draws ?? 0;
        byUser[s.user_id].losses += s.losses ?? 0;
      });
      userIds.forEach((id) => {
        const r = byUser[id] ?? { wins: 0, draws: 0, losses: 0 };
        standingRows.push({ user_id: id, wins: r.wins, draws: r.draws, losses: r.losses });
      });
    }

    const recordMap = Object.fromEntries(standingRows.map((r) => [r.user_id, r]));

    const ranked: LeaderboardRow[] = list.map((p, i) => {
      const rec = recordMap[p.id] ?? { wins: 0, draws: 0, losses: 0 };
      return {
        user_id: p.id,
        rank: i + 1,
        xp: p.xp ?? 0,
        level: p.level ?? 1,
        wins: rec.wins,
        draws: rec.draws,
        losses: rec.losses,
      };
    });
    setRows(ranked);

    const map: Record<string, string> = {};
    const countryMap: Record<string, string | null> = {};
    list.forEach((p) => {
      map[p.id] = p.username || p.display_name || 'Anonymous';
      countryMap[p.id] = p.country ?? null;
    });
    setProfiles(map);
    setProfileCountries(countryMap);
  }, [filter]);

  const loadMoreLeaderboard = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const offset = rows.length;
    const { data: { user } } = await supabase.auth.getUser();
    let query = supabase
      .from('profiles')
      .select('id, username, display_name, xp, level, country, live_quiz_win_count')
      .order('xp', { ascending: false });

    if (filter === 'country' && user?.id) {
      const { data: myProfile } = await supabase.from('profiles').select('country').eq('id', user.id).single();
      const myCountry = (myProfile as { country?: string | null } | null)?.country;
      if (myCountry) query = query.eq('country', myCountry);
    } else if (filter === 'friends' && user?.id) {
      const { data: friendsData } = await supabase.rpc('get_my_friends_with_status');
      const friendIds = (friendsData ?? []).map((f: { friend_id: string }) => f.friend_id);
      friendIds.push(user.id);
      if (friendIds.length === 0) {
        setLoadingMore(false);
        return;
      }
      query = query.in('id', friendIds);
    }

    const { data: profilesData } = await query.range(offset, offset + 99);
    const list = (profilesData ?? []) as { id: string; username?: string; display_name?: string; xp?: number; level?: number; country?: string | null; live_quiz_win_count?: number }[];
    setHasMore(list.length >= 100);

    const userIds = list.map((p) => p.id);
    const standingRows: { user_id: string; wins: number; draws: number; losses: number }[] = [];
    if (userIds.length > 0) {
      const { data: standingsData } = await supabase
        .from('standings')
        .select('user_id, wins, draws, losses')
        .in('user_id', userIds);
      const standings = (standingsData ?? []) as { user_id: string; wins: number; draws: number; losses: number }[];
      const byUser: Record<string, { wins: number; draws: number; losses: number }> = {};
      standings.forEach((s) => {
        if (!byUser[s.user_id]) byUser[s.user_id] = { wins: 0, draws: 0, losses: 0 };
        byUser[s.user_id].wins += s.wins ?? 0;
        byUser[s.user_id].draws += s.draws ?? 0;
        byUser[s.user_id].losses += s.losses ?? 0;
      });
      userIds.forEach((id) => {
        const r = byUser[id] ?? { wins: 0, draws: 0, losses: 0 };
        standingRows.push({ user_id: id, wins: r.wins, draws: r.draws, losses: r.losses });
      });
    }
    const recordMap = Object.fromEntries(standingRows.map((r) => [r.user_id, r]));
    const newRanked: LeaderboardRow[] = list.map((p, i) => {
      const rec = recordMap[p.id] ?? { wins: 0, draws: 0, losses: 0 };
      return {
        user_id: p.id,
        rank: offset + i + 1,
        xp: p.xp ?? 0,
        level: p.level ?? 1,
        wins: rec.wins,
        draws: rec.draws,
        losses: rec.losses,
      };
    });

    setRows((prev) => [...prev, ...newRanked]);
    setProfiles((prev) => {
      const next = { ...prev };
      list.forEach((p) => {
        next[p.id] = p.username || p.display_name || 'Anonymous';
      });
      return next;
    });
    setProfileCountries((prev) => {
      const next = { ...prev };
      list.forEach((p) => {
        next[p.id] = p.country ?? null;
      });
      return next;
    });
    setLoadingMore(false);
  }, [filter, hasMore, loadingMore, rows.length]);

  useEffect(() => {
    setHasMore(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    fetchDailyLeaderboard();
  }, [fetchDailyLeaderboard]);

  const filterOptions: { key: LeaderboardFilter; label: string }[] = [
    { key: 'global', label: 'Global' },
    { key: 'country', label: 'Country' },
    { key: 'friends', label: 'Friends' },
  ];

  useFocusEffect(
    useCallback(() => {
      if (params.scrollToMe) {
        setFilter('global');
        scrollToMeDoneRef.current = false;
      } else {
        setMyUserId(null);
      }
      fetchLeaderboard();
      fetchDailyLeaderboard();
    }, [fetchLeaderboard, fetchDailyLeaderboard, params.scrollToMe])
  );

  useEffect(() => {
    if (!params.scrollToMe || scrollToMeDoneRef.current || displayRows.length === 0) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      setMyUserId(user.id);
      const index = displayRows.findIndex((r) => r.user_id === user.id);
      if (index < 0) return;
      scrollToMeDoneRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }, 300);
    })();
  }, [params.scrollToMe, displayRows]);

  async function openProfileCard(userId: string) {
    if (!userId || typeof userId !== 'string') return;
    setCardModalVisible(true);
    setCardLoading(true);
    setCardData(null);
    const { data: { user: me } } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('get_user_profile_card', {
      p_user_id: userId,
      p_viewer_id: me?.id ?? null,
    });
    setCardLoading(false);
    // RPC can return single JSONB as object, as single-element array, or wrapped in function-name key
    let raw: unknown = data;
    if (data != null && Array.isArray(data) && data.length > 0) raw = data[0];
    else if (data != null && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      const fnKey = 'get_user_profile_card';
      if (Object.keys(obj).length === 1 && typeof obj[fnKey] === 'object' && obj[fnKey] !== null) raw = obj[fnKey];
    }
    if (error) console.warn('get_user_profile_card error', error);
    if (!error && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const d = raw as Record<string, unknown>;
      setCardData({
        user_id: userId,
        username: (d.username as string) ?? '',
        global_rank: d.global_rank != null ? Number(d.global_rank) : null,
        live_quiz_win_count: Number(d.live_quiz_win_count) ?? 0,
        live_quizzes_participated: Number(d.live_quizzes_participated) ?? 0,
        live_quiz_top_10_finishes: Number(d.live_quiz_top_10_finishes) ?? 0,
        joined_at: (d.joined_at as string) ?? '',
        total_quizzes_completed: Number(d.total_quizzes_completed) ?? 0,
        total_wins: Number(d.total_wins) ?? 0,
        total_draws: Number(d.total_draws) ?? 0,
        total_losses: Number(d.total_losses) ?? 0,
        total_questions_correct: Number(d.total_questions_correct) ?? 0,
        total_questions_incorrect: Number(d.total_questions_incorrect) ?? 0,
        xp: Number(d.xp) ?? 0,
        level: Number(d.level) ?? 1,
        country: (d.country as string) || null,
        avatar_url: (d.avatar_url as string) || null,
        bio: (d.bio as string) || null,
      });
    }
  }

  const [inviteSending, setInviteSending] = useState(false);
  async function handleInviteFromCard() {
    if (!cardData || inviteSending) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'You must be signed in to invite.');
      return;
    }
    if (cardData.user_id === user.id) {
      Alert.alert('Error', 'You cannot invite yourself.');
      return;
    }
    setInviteSending(true);
    try {
      const { data: matchId, error: createErr } = await supabase.rpc('create_invite_session');
      if (createErr || !matchId) {
        Alert.alert('Error', createErr?.message ?? 'Could not create session');
        return;
      }
      const { data: inviteId, error: inviteErr } = await supabase.rpc('invite_by_username', {
        p_match_id: matchId,
        p_to_username: cardData.username.trim(),
      });
      if (inviteErr) {
        Alert.alert('Error', inviteErr.message ?? 'Could not send invite');
        return;
      }
      if (SUPABASE_URL && inviteId) {
        const session = await supabase.auth.getSession();
        await fetch(`${SUPABASE_URL}/functions/v1/send-invite-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data.session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ invite_id: inviteId }),
        }).catch(() => {});
      }
      setCardModalVisible(false);
      setCardData(null);
      router.replace(`/match/${matchId}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setInviteSending(false);
    }
  }

  function formatJoinedDate(iso: string) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  function formatToday() {
    return new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const header = (
    <>
      <Text style={[styles.title, isDark && styles.titleDark]}>Leaderboards</Text>

      <View style={[styles.filterRow, isDark && styles.filterRowDark]}>
        {filterOptions.map((opt) => (
          <Pressable
            key={opt.key}
            style={[styles.filterPill, filter === opt.key && styles.filterPillActive, isDark && styles.filterPillDark, filter === opt.key && isDark && styles.filterPillActiveDark]}
            onPress={() => setFilter(opt.key)}
          >
            <Text style={[styles.filterPillText, filter === opt.key && styles.filterPillTextActive, isDark && styles.filterPillTextDark, filter === opt.key && isDark && styles.filterPillTextActiveDark]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Today's Daily Quiz section */}
      <View style={[styles.dailySection, isDark && styles.dailySectionDark]}>
        <Text style={[styles.dailySectionTitle, isDark && styles.dailySectionTitleDark]}>Today&apos;s Daily Quiz</Text>
        <Text style={[styles.dailySectionSub, isDark && styles.dailySectionSubDark]}>
          Highest scores today · Resets at midnight UTC
        </Text>
        <Text style={[styles.dailySectionDate, isDark && styles.dailySectionDateDark]}>{formatToday()}</Text>
        {dailyLoading ? (
          <ActivityIndicator size="small" color={isDark ? '#a78bfa' : '#5b21b6'} style={styles.dailyLoader} />
        ) : dailyRows.length === 0 ? (
          <Text style={[styles.dailyEmpty, isDark && styles.dailyEmptyDark]}>No scores yet today.</Text>
        ) : (
          <>
            <View style={[styles.dailyTableHeader, isDark && styles.dailyTableHeaderDark]}>
              <Text style={[styles.thRank, isDark && styles.thDark]}>#</Text>
              <Text style={[styles.thName, isDark && styles.thDark]}>Username</Text>
              <Text style={[styles.dailyThScore, isDark && styles.thDark]}>Score</Text>
            </View>
            {dailyRows.map((item) => (
              <View key={item.user_id} style={[styles.dailyRow, isDark && styles.dailyRowDark]}>
                <Text style={[styles.dailyRank, isDark && styles.rankDark]}>#{item.rank}</Text>
                <View style={styles.dailyNameWrap}>
                  <Text style={[styles.name, isDark && styles.nameDark]} numberOfLines={1}>
                    {item.username ?? '—'}
                  </Text>
                </View>
                <Text style={[styles.dailyScore, isDark && styles.ptsDark]}>{item.score}</Text>
              </View>
            ))}
          </>
        )}
        <Pressable
          style={[styles.dailyViewAllBtn, isDark && styles.dailyViewAllBtnDark]}
          onPress={() => router.push('/leaderboards/daily')}
        >
          <Text style={styles.dailyViewAllText}>View full leaderboard</Text>
        </Pressable>
      </View>

      <Text style={[styles.allTimeTitle, isDark && styles.allTimeTitleDark]}>Trivora Top 100 Leaderboard</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        {sortBy === 'wins' ? 'Sorted by most wins' : 'Top 100 by XP'} — Official Trivora rankings.
      </Text>
      <View style={[styles.tableHeader, isDark && styles.tableHeaderDark]}>
        <Text style={[styles.thRank, isDark && styles.thDark]}>#</Text>
        <Text style={[styles.thName, isDark && styles.thDark]}>Username</Text>
        <Pressable
          style={styles.thRecordPressable}
          onPress={() => setSortBy((s) => (s === 'xp' ? 'wins' : 'xp'))}
        >
          <Text style={[styles.thRecord, isDark && styles.thDark]}>W-D-L</Text>
          <Ionicons
            name={sortBy === 'wins' ? 'chevron-down' : 'swap-vertical'}
            size={14}
            color={isDark ? '#94a3b8' : '#64748b'}
            style={styles.thRecordArrow}
          />
        </Pressable>
        <Text style={[styles.thLevel, isDark && styles.thDark]}>Lvl</Text>
        <Text style={[styles.thPts, isDark && styles.thDark]}>XP</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.container, isDark && styles.containerDark, isTablet && styles.containerTablet]}>
      <View style={[styles.listWrap, isTablet && { maxWidth: CONTENT_MAX_WIDTH, width: '100%' }]}>
      <FlatList
        ref={listRef}
        data={displayRows}
        keyExtractor={(item, index) => item?.user_id ?? `row-${index}`}
        ListHeaderComponent={header}
        contentContainerStyle={[
          styles.listContent,
          isDark && { paddingTop: 20 + insets.top + 44 },
        ]}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => {
          const isMe = params.scrollToMe && myUserId === item.user_id;
          return (
          <View style={[styles.row, isDark && styles.rowDark, isMe && styles.rowHighlight, isMe && isDark && styles.rowHighlightDark]}>
            <Text style={[styles.rank, isDark && styles.rankDark, isMe && styles.rankHighlight, isMe && isDark && styles.rankHighlightDark]}>#{item.rank}</Text>
            <Pressable style={styles.namePressable} onPress={() => openProfileCard(item.user_id)}>
              <View style={styles.nameWithFlag}>
                <Text style={[styles.name, isDark && styles.nameDark, isMe && styles.nameHighlight, isMe && isDark && styles.nameHighlightDark]} numberOfLines={1}>
                  {profiles[item.user_id] ?? '—'}
                </Text>
                {profileCountries[item.user_id] && countryToFlagEmoji(profileCountries[item.user_id]) ? (
                  <Text style={styles.nameFlag}>{countryToFlagEmoji(profileCountries[item.user_id])}</Text>
                ) : null}
              </View>
            </Pressable>
            <Text style={[styles.recordCell, isDark && styles.recordCellDark]} numberOfLines={1}>
              {item.wins}-{item.draws}-{item.losses}
            </Text>
            <Text style={[styles.levelCell, isDark && styles.levelCellDark]}>{item.level}</Text>
            <Text style={[styles.pts, isDark && styles.ptsDark]}>{item.xp}</Text>
          </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, isDark && styles.emptyDark]}>No users yet.</Text>
        }
        ListFooterComponent={
          displayRows.length >= 100 && hasMore ? (
            <Pressable
              style={[styles.loadMoreBtn, isDark && styles.loadMoreBtnDark]}
              onPress={loadMoreLeaderboard}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={isDark ? '#a78bfa' : '#5b21b6'} />
              ) : (
                <Text style={[styles.loadMoreText, isDark && styles.loadMoreTextDark]}>Load another 100</Text>
              )}
            </Pressable>
          ) : null
        }
      />
      </View>

      <Modal visible={cardModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setCardModalVisible(false)}>
          <Pressable style={[styles.cardModal, isDark && styles.cardModalDark]} onPress={(e) => e.stopPropagation()}>
            {cardLoading ? (
              <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#5b21b6'} style={styles.cardLoader} />
            ) : cardData ? (
              <>
                <View style={styles.cardAvatarWrap}>
                  <Image
                    source={{ uri: cardData.avatar_url || PLACEHOLDER_IMAGES.profile }}
                    style={styles.cardAvatar}
                  />
                </View>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>{cardData.username ?? '—'}</Text>
                  {cardData.global_rank != null && cardData.global_rank > 0 ? (
                    <View style={[
                      styles.rankBadgeWrap,
                      cardData.global_rank === 1 && styles.rankBadgeWrapGold,
                      cardData.global_rank === 2 && styles.rankBadgeWrapSilver,
                      cardData.global_rank === 3 && styles.rankBadgeWrapBronze,
                    ]}>
                      <LinearGradient
                        colors={
                          cardData.global_rank === 1 ? ['#b8860b', '#d4a84b', '#f4e4a6', '#d4a84b', '#8b6914'] :
                          cardData.global_rank === 2 ? ['#6b7280', '#9ca3af', '#e5e7eb', '#9ca3af', '#4b5563'] :
                          cardData.global_rank === 3 ? ['#92400e', '#b45309', '#fcd34d', '#b45309', '#78350f'] :
                          isDark ? ['#4c1d95', '#6d28d9', '#8b5cf6', '#6d28d9'] : ['#5b21b6', '#7c3aed', '#a78bfa', '#7c3aed']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.rankBadgeShine} pointerEvents="none">
                        <LinearGradient
                          colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.15)', 'transparent']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </View>
                      <Text style={[
                        styles.rankBadgeText,
                        cardData.global_rank <= 3 && styles.rankBadgeTextMedal,
                        cardData.global_rank > 3 && styles.rankBadgeTextOnPurple,
                      ]}>RANK #{cardData.global_rank}</Text>
                    </View>
                  ) : null}
                </View>
                {cardData.bio ? (
                  <View style={[styles.cardBioWrap, isDark && styles.cardBioWrapDark]}>
                    <Text style={[styles.cardBio, isDark && styles.cardBioDark]}>{cardData.bio}</Text>
                  </View>
                ) : null}
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Level / XP</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>
                    {cardData.level} · {cardData.xp} XP
                  </Text>
                </View>
                {cardData.country ? (
                  <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                    <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Country</Text>
                    <View style={styles.cardCountryValue}>
                      {countryToFlagEmoji(cardData.country) ? (
                        <Text style={styles.cardCountryFlag}>{countryToFlagEmoji(cardData.country)}</Text>
                      ) : null}
                      <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{countryCodeToName(cardData.country)}</Text>
                    </View>
                  </View>
                ) : null}
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>W-D-L</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.total_wins}-{cardData.total_draws}-{cardData.total_losses}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Live quizzes participated</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.live_quizzes_participated ?? 0}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Live quiz top 10 finish</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.live_quiz_top_10_finishes ?? 0}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Live quiz wins</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.live_quiz_win_count ?? 0}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Quizzes completed</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.total_quizzes_completed}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Total correct answers</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.total_questions_correct}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Total incorrect answers</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.total_questions_incorrect}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Date joined</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{formatJoinedDate(cardData.joined_at)}</Text>
                </View>
                <Pressable
                  style={[styles.cardInviteBtn, isDark && styles.cardInviteBtnDark]}
                  onPress={handleInviteFromCard}
                  disabled={inviteSending}
                >
                  {inviteSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.cardInviteText}>Invite to game</Text>
                  )}
                </Pressable>
                <Pressable style={[styles.cardCloseBtn, isDark && styles.cardCloseBtnDark]} onPress={() => setCardModalVisible(false)}>
                  <Text style={styles.cardCloseText}>Close</Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.cardError, isDark && styles.cardErrorDark]}>Could not load profile.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  listContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  titleDark: { color: '#efeff1' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16, justifyContent: 'flex-start' },
  filterRowDark: {},
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  filterPillActive: { backgroundColor: '#7c3aed' },
  filterPillDark: { backgroundColor: '#27272a' },
  filterPillActiveDark: { backgroundColor: '#6d28d9' },
  filterPillText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextDark: { color: '#a1a1aa' },
  filterPillTextActiveDark: { color: '#fff' },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  subtitleDark: { color: '#adadb8' },
  dailySection: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dailySectionDark: { backgroundColor: '#18181b', borderColor: '#27272a' },
  dailySectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  dailySectionTitleDark: { color: '#fafafa' },
  dailySectionSub: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  dailySectionSubDark: { color: '#a1a1aa' },
  dailySectionDate: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  dailySectionDateDark: { color: '#71717a' },
  dailyLoader: { paddingVertical: 16 },
  dailyEmpty: { fontSize: 14, color: '#64748b', paddingVertical: 12, textAlign: 'center' },
  dailyEmptyDark: { color: '#a1a1aa' },
  dailyTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  dailyTableHeaderDark: { borderBottomColor: '#3f3f46' },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  dailyRowDark: { borderBottomColor: '#27272a' },
  dailyRank: { width: 36, fontWeight: '600', fontSize: 15 },
  dailyNameWrap: { flex: 1, minWidth: 0 },
  dailyThScore: { width: 56, fontWeight: '700', fontSize: 14, textAlign: 'right' },
  dailyScore: { width: 56, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  dailyViewAllBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#5b21b6',
    alignItems: 'center',
  },
  dailyViewAllBtnDark: { backgroundColor: '#6d28d9' },
  dailyViewAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  allTimeTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  allTimeTitleDark: { color: '#fafafa' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  tableHeaderDark: { borderBottomColor: '#3f3f46' },
  thRank: { fontWeight: '700', width: 36, fontSize: 14 },
  thName: { flex: 1, fontWeight: '700', fontSize: 14 },
  thRecordPressable: {
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thRecord: { fontWeight: '700', fontSize: 14, textAlign: 'center' },
  thRecordArrow: { marginLeft: 2 },
  thLevel: { width: 36, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  thPts: { width: 52, fontWeight: '700', fontSize: 14, textAlign: 'right' },
  thDark: { color: '#e4e4e7' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowDark: { borderBottomColor: '#26262c' },
  rowHighlight: { backgroundColor: 'rgba(251, 191, 36, 0.15)', borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  rowHighlightDark: { backgroundColor: 'rgba(251, 191, 36, 0.12)', borderLeftColor: '#fbbf24' },
  rank: { fontWeight: '600', width: 36, fontSize: 15 },
  rankHighlight: { fontWeight: '800', color: '#b45309' },
  rankHighlightDark: { color: '#fbbf24' },
  nameHighlight: { fontWeight: '700', color: '#b45309' },
  nameHighlightDark: { color: '#fbbf24' },
  rankDark: { color: '#efeff1' },
  namePressable: { flex: 1 },
  nameWithFlag: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { fontSize: 15, flexShrink: 1 },
  nameDark: { color: '#efeff1' },
  nameFlag: { fontSize: 16 },
  recordCell: { minWidth: 92, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  recordCellDark: { color: '#a1a1aa' },
  levelCell: { width: 36, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  levelCellDark: { color: '#fbbf24' },
  pts: { width: 52, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  ptsDark: { color: '#a78bfa' },
  empty: { color: '#64748b', marginTop: 24, textAlign: 'center' },
  emptyDark: { color: '#adadb8' },
  loadMoreBtn: {
    marginTop: 16,
    marginBottom: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91, 33, 182, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(91, 33, 182, 0.3)',
  },
  loadMoreBtnDark: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  loadMoreText: { fontSize: 16, fontWeight: '600', color: '#5b21b6' },
  loadMoreTextDark: { color: '#a78bfa' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cardModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  containerTablet: { alignItems: 'center' },
  listWrap: { flex: 1, width: '100%' },
  cardModalDark: { backgroundColor: '#18181b' },
  cardLoader: { padding: 32 },
  cardAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 12,
  },
  cardAvatar: { width: '100%', height: '100%' },
  cardTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  cardTitleDark: { color: '#fafafa' },
  rankBadgeWrap: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  rankBadgeWrapGold: {
    borderColor: 'rgba(245, 158, 11, 0.95)',
    shadowColor: '#b8860b',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  rankBadgeWrapSilver: {
    borderColor: 'rgba(203, 213, 225, 0.95)',
    shadowColor: '#64748b',
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 5,
  },
  rankBadgeWrapBronze: {
    borderColor: 'rgba(217, 119, 6, 0.95)',
    shadowColor: '#92400e',
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 5,
  },
  rankBadgeShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#1f2937',
  },
  rankBadgeTextMedal: {
    color: '#1f2937',
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  rankBadgeTextOnPurple: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardBioWrap: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  cardBioWrapDark: {},
  cardBio: { fontSize: 14, color: '#475569', lineHeight: 20, textAlign: 'center' },
  cardBioDark: { color: '#a1a1aa' },
  cardStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cardStatRowDark: { borderBottomColor: '#27272a' },
  cardLabel: { fontSize: 15, color: '#64748b' },
  cardLabelDark: { color: '#a1a1aa' },
  cardValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardValueDark: { color: '#e4e4e7' },
  cardCountryValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCountryFlag: { fontSize: 18 },
  cardInviteBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  cardInviteBtnDark: { backgroundColor: '#16a34a' },
  cardInviteText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cardCloseBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#5b21b6',
    alignItems: 'center',
  },
  cardCloseBtnDark: { backgroundColor: '#6d28d9' },
  cardCloseText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cardError: { color: '#64748b', textAlign: 'center', padding: 20 },
  cardErrorDark: { color: '#a1a1aa' },
});
