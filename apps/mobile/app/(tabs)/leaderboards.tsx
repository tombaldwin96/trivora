import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';

type ProfileCardData = {
  username: string;
  country: string;
  joined_at: string;
  total_quizzes_completed: number;
  total_questions_correct: number;
};

type StandingRow = {
  user_id: string;
  rank: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

export default function LeaderboardsTab() {
  const { isDark } = useTheme();
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cardData, setCardData] = useState<ProfileCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: standingsData } = await supabase
        .from('standings')
        .select('user_id, points, wins, draws, losses')
        .order('points', { ascending: false })
        .limit(300);

      const list = (standingsData ?? []) as { user_id: string; points: number; wins: number; draws: number; losses: number }[];
      const seen = new Set<string>();
      const ranked: StandingRow[] = [];
      for (const r of list) {
        if (seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        ranked.push({
          user_id: r.user_id,
          rank: ranked.length + 1,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          points: r.points,
        });
        if (ranked.length >= 100) break;
      }

      const rankedIds = new Set(ranked.map((r) => r.user_id));

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .limit(500);

      const allProfiles = (profilesData ?? []) as { id: string; username?: string; display_name?: string }[];
      const noGames: StandingRow[] = [];
      for (const p of allProfiles) {
        if (rankedIds.has(p.id)) continue;
        noGames.push({
          user_id: p.id,
          rank: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
        });
        if (noGames.length >= 100) break;
      }

      const combined: StandingRow[] = [...noGames, ...ranked];
      setRows(combined);

      const ids = combined.map((r) => r.user_id).filter(Boolean);
      if (ids.length) {
        const { data: p } = await supabase.from('profiles').select('id, username, display_name').in('id', ids);
        const map: Record<string, string> = {};
        (p ?? []).forEach((x: { id: string; username?: string; display_name?: string }) => {
          map[x.id] = x.username || x.display_name || 'Anonymous';
        });
        setProfiles(map);
      }
    })();
  }, []);

  async function openProfileCard(userId: string) {
    setCardModalVisible(true);
    setCardLoading(true);
    setCardData(null);
    const { data } = await supabase.rpc('get_user_profile_card', { p_user_id: userId });
    setCardLoading(false);
    if (data && typeof data === 'object') {
      setCardData({
        username: (data as ProfileCardData).username ?? '',
        country: (data as ProfileCardData).country ?? '',
        joined_at: (data as ProfileCardData).joined_at ?? '',
        total_quizzes_completed: Number((data as ProfileCardData).total_quizzes_completed) ?? 0,
        total_questions_correct: Number((data as ProfileCardData).total_questions_correct) ?? 0,
      });
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

  const header = (
    <>
      <Text style={[styles.title, isDark && styles.titleDark]}>Leaderboards</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>Top 100 by points · Rank 0 = no games yet</Text>
      <Text style={[styles.scoringNote, isDark && styles.scoringNoteDark]}>
        1v1 win: 3 pts · Promotion: 5 pts · Daily quiz: 2 pts · Correct answer: 1 pt · Referral: 10 pts/friend
      </Text>
      <View style={[styles.tableHeader, isDark && styles.tableHeaderDark]}>
        <Text style={[styles.thRank, isDark && styles.thDark]}>#</Text>
        <Text style={[styles.thName, isDark && styles.thDark]}>Username</Text>
        <Text style={[styles.thW, isDark && styles.thDark]}>W</Text>
        <Text style={[styles.thD, isDark && styles.thDark]}>D</Text>
        <Text style={[styles.thL, isDark && styles.thDark]}>L</Text>
        <Text style={[styles.thPts, isDark && styles.thDark]}>Pts</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.user_id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={[styles.row, isDark && styles.rowDark]}>
            <Text style={[styles.rank, isDark && styles.rankDark]}>{item.rank === 0 ? '0' : `#${item.rank}`}</Text>
            <Pressable style={styles.namePressable} onPress={() => openProfileCard(item.user_id)}>
              <Text style={[styles.name, isDark && styles.nameDark]} numberOfLines={1}>
                {profiles[item.user_id] ?? '—'}
              </Text>
            </Pressable>
            <Text style={[styles.wdl, isDark && styles.wdlDark]}>{item.wins}</Text>
            <Text style={[styles.wdl, isDark && styles.wdlDark]}>{item.draws}</Text>
            <Text style={[styles.wdl, isDark && styles.wdlDark]}>{item.losses}</Text>
            <Text style={[styles.pts, isDark && styles.ptsDark]}>{item.points}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, isDark && styles.emptyDark]}>No users yet.</Text>
        }
      />

      <Modal visible={cardModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setCardModalVisible(false)}>
          <Pressable style={[styles.cardModal, isDark && styles.cardModalDark]} onPress={(e) => e.stopPropagation()}>
            {cardLoading ? (
              <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#5b21b6'} style={styles.cardLoader} />
            ) : cardData ? (
              <>
                <Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>{cardData.username}</Text>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Quizzes completed</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.total_quizzes_completed}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Questions correct</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.total_questions_correct}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Joined</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{formatJoinedDate(cardData.joined_at)}</Text>
                </View>
                <View style={[styles.cardStatRow, isDark && styles.cardStatRowDark]}>
                  <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>Country</Text>
                  <Text style={[styles.cardValue, isDark && styles.cardValueDark]}>{cardData.country || '—'}</Text>
                </View>
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
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  subtitleDark: { color: '#adadb8' },
  scoringNote: { fontSize: 12, color: '#64748b', marginBottom: 12, paddingHorizontal: 2 },
  scoringNoteDark: { color: '#71717a' },
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
  thW: { width: 28, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  thD: { width: 28, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  thL: { width: 28, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  thPts: { width: 40, fontWeight: '700', fontSize: 14, textAlign: 'right' },
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
  rank: { fontWeight: '600', width: 36, fontSize: 15 },
  rankDark: { color: '#efeff1' },
  namePressable: { flex: 1 },
  name: { fontSize: 15 },
  nameDark: { color: '#efeff1' },
  wdl: { width: 28, fontSize: 15, textAlign: 'center' },
  wdlDark: { color: '#a1a1aa' },
  pts: { width: 40, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  ptsDark: { color: '#a78bfa' },
  empty: { color: '#64748b', marginTop: 24, textAlign: 'center' },
  emptyDark: { color: '#adadb8' },
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
  cardModalDark: { backgroundColor: '#18181b' },
  cardLoader: { padding: 32 },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  cardTitleDark: { color: '#fafafa' },
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
  cardCloseBtn: {
    marginTop: 20,
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
