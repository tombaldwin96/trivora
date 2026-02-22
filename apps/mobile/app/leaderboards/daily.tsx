import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { useResponsive, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import type { LeaderboardFilter } from '../(tabs)/leaderboards';

type DailyLeaderboardRow = {
  rank: number;
  user_id: string;
  username: string;
  score: number;
  live_quiz_win_count?: number;
};

function formatToday() {
  const d = new Date();
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

const filterOptions: { key: LeaderboardFilter; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'country', label: 'Country' },
  { key: 'friends', label: 'Friends' },
];

export default function DailyQuizLeaderboardScreen() {
  const { isDark } = useTheme();
  const { isTablet } = useResponsive();
  const router = useRouter();
  const [filter, setFilter] = useState<LeaderboardFilter>('global');
  const [rows, setRows] = useState<DailyLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc('get_daily_quiz_leaderboard', { p_limit: filter === 'global' ? 100 : 300 });
      if (error) {
        setRows([]);
        return;
      }
      let list = (data ?? []) as DailyLeaderboardRow[];
      if (list.length > 0 && filter !== 'global') {
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
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  const header = (
    <>
      <Text style={[styles.title, isDark && styles.titleDark]}>Daily Quiz Leaderboard</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        Highest scores today · Resets at midnight UTC
      </Text>
      <Text style={[styles.dateLabel, isDark && styles.dateLabelDark]}>{formatToday()}</Text>
      <View style={[styles.filterRow, isDark && styles.filterRowDark]}>
        {filterOptions.map((opt) => (
          <Pressable
            key={opt.key}
            style={[
              styles.filterPill,
              isDark && styles.filterPillDark,
              filter === opt.key && (isDark ? styles.filterPillActiveDark : styles.filterPillActive),
            ]}
            onPress={() => setFilter(opt.key)}
          >
            <Text
              style={[
                styles.filterPillText,
                filter === opt.key && (isDark ? styles.filterPillTextActiveDark : styles.filterPillTextActive),
                isDark && !(filter === opt.key) && styles.filterPillTextDark,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.tableHeader, isDark && styles.tableHeaderDark]}>
        <Text style={[styles.thRank, isDark && styles.thDark]}>#</Text>
        <Text style={[styles.thName, isDark && styles.thDark]}>Username</Text>
        <Text style={[styles.thScore, isDark && styles.thDark]}>Score</Text>
      </View>
    </>
  );

  if (loading && rows.length === 0) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Pressable style={[styles.backButton, isDark && styles.backButtonDark]} onPress={() => router.back()} hitSlop={16}>
          <Ionicons name="chevron-back" size={24} color={isDark ? '#fff' : '#111827'} />
          <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Back</Text>
        </Pressable>
        <View style={[styles.centered, isDark && styles.centeredDark, { flex: 1 }]}>
          <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#5b21b6'} />
          <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>Loading leaderboard…</Text>
        </View>
      </View>
    );
  }

  const goBack = () => router.back();

  return (
    <View style={[styles.container, isDark && styles.containerDark, isTablet && styles.containerTablet]}>
      <Pressable style={[styles.backButton, isDark && styles.backButtonDark]} onPress={goBack} hitSlop={16}>
        <Ionicons name="chevron-back" size={24} color={isDark ? '#fff' : '#111827'} />
        <Text style={[styles.backButtonText, isDark && styles.backButtonTextDark]}>Back</Text>
      </Pressable>
      <View style={[styles.listWrap, isTablet && { maxWidth: CONTENT_MAX_WIDTH, width: '100%' }]}>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.row, isDark && styles.rowDark]}>
              <Text style={[styles.rank, isDark && styles.rankDark]}>#{item.rank}</Text>
              <Text style={[styles.name, isDark && styles.nameDark]} numberOfLines={1}>
                {item.username ?? '—'}
              </Text>
              <Text style={[styles.score, isDark && styles.scoreDark]}>{item.score}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, isDark && styles.emptyDark]}>
              No scores yet today. Complete today's daily quiz to appear here.
            </Text>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  centeredDark: { backgroundColor: '#0e0e10' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#64748b' },
  loadingTextDark: { color: '#a1a1aa' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  containerTablet: { alignItems: 'center' },
  listWrap: { flex: 1, width: '100%' },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  backButtonDark: {},
  backButtonText: { fontSize: 17, color: '#111827', marginLeft: 4 },
  backButtonTextDark: { color: '#fff' },
  listContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4, color: '#111827' },
  titleDark: { color: '#efeff1' },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  subtitleDark: { color: '#adadb8' },
  dateLabel: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  dateLabelDark: { color: '#71717a' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16, justifyContent: 'center' },
  filterRowDark: {},
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  filterPillActive: { backgroundColor: '#7c3aed' },
  filterPillDark: { backgroundColor: '#27272a' },
  filterPillActiveDark: { backgroundColor: '#6d28d9' },
  filterPillText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#fff' },
  filterPillTextDark: { color: '#a1a1aa' },
  filterPillTextActiveDark: { color: '#fff' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  tableHeaderDark: { borderBottomColor: '#3f3f46' },
  thRank: { fontWeight: '700', width: 40, fontSize: 14 },
  thName: { flex: 1, fontWeight: '700', fontSize: 14 },
  thScore: { width: 56, fontWeight: '700', fontSize: 14, textAlign: 'right' },
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
  rank: { fontWeight: '600', width: 40, fontSize: 15 },
  rankDark: { color: '#efeff1' },
  name: { flex: 1, fontSize: 15 },
  nameDark: { color: '#efeff1' },
  score: { width: 56, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  scoreDark: { color: '#a78bfa' },
  empty: { color: '#64748b', marginTop: 24, textAlign: 'center', paddingHorizontal: 20 },
  emptyDark: { color: '#adadb8' },
});
