import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import type { ChampionshipTournament } from '@trivora/core';

type TournamentRow = ChampionshipTournament & { starts_at?: string; ends_at?: string };

const GLOBAL_TOURNAMENT_ID = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function countdown(toIso: string | null): string {
  if (!toIso) return '';
  const to = new Date(toIso).getTime();
  const now = Date.now();
  const d = Math.max(0, to - now);
  if (d <= 0) return 'Live';
  const days = Math.floor(d / 86400000);
  const hours = Math.floor((d % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor((d % 3600000) / 60000);
  return `${mins}m`;
}

const HEADER_HEIGHT = 56;

export default function TournamentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [registrations, setRegistrations] = useState<Record<string, string>>({});
  const [globalRegistrationCount, setGlobalRegistrationCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdownTick, setCountdownTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: tData } = await supabase
        .from('tournaments')
        .select('id, type, name, title, description, entry_fee_pence, prize_pence, registration_opens_at, games_begin_at, finals_at, finals_top_n, status')
        .order('starts_at', { ascending: false })
        .limit(10);
      const raw = (tData ?? []) as TournamentRow[];
      const filtered = raw.filter(
        (t) => t.type === 'global' || t.type === 'national' || ['published', 'live'].includes(t.status)
      );
      setTournaments(filtered);

      const globalId = raw.find((t) => t.id === GLOBAL_TOURNAMENT_ID || t.type === 'global')?.id;
      if (globalId) {
        const { count } = await supabase
          .from('tournament_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', globalId);
        setGlobalRegistrationCount(count ?? 0);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: regData } = await supabase
          .from('tournament_registrations')
          .select('tournament_id, payment_status')
          .eq('user_id', user.id);
        const map: Record<string, string> = {};
        (regData ?? []).forEach((r: { tournament_id: string; payment_status: string }) => {
          map[r.tournament_id] = r.payment_status;
        });
        setRegistrations(map);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCountdownTick((c) => c + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const global = tournaments.find((t) => t.id === GLOBAL_TOURNAMENT_ID || t.type === 'global');
  const nationals = tournaments.filter((t) => t.type === 'national');

  const [testMatchLoading, setTestMatchLoading] = useState(false);
  const handleTestMatch = async () => {
    setTestMatchLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth/signup');
        return;
      }
      const { data, error } = await supabase.rpc('tournament_test_enter', { p_user_id: user.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const matchId = row?.match_id ?? row?.id;
      if (matchId) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/match/${matchId}` as any);
      } else {
        throw new Error('No match returned');
      }
    } catch (e) {
      console.error('Tournament test enter:', e);
      setTestMatchLoading(false);
    } finally {
      setTestMatchLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + HEADER_HEIGHT }]}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading tournaments…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + HEADER_HEIGHT, paddingBottom: nationals.length > 0 ? 40 : 80 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {global ? (
        <GlobalQuizHero
          tournament={global}
          paymentStatus={registrations[global.id]}
          registrationCount={globalRegistrationCount}
          countdownTick={countdownTick}
          testMatchLoading={testMatchLoading}
          onTestMatch={handleTestMatch}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: '/(tabs)/modes/tournaments/[id]', params: { id: global.id } } as any);
          }}
        />
      ) : (
        <>
          <Text style={styles.sectionTitle}>The Trivora Global Quiz Rankings</Text>
          <Text style={styles.sectionSubtitle}>Flagship annual championship · Top 16 → Live Finals</Text>
          <Pressable
            onPress={handleTestMatch}
            disabled={testMatchLoading}
            style={({ pressed }) => [styles.testButton, pressed && styles.testButtonPressed, testMatchLoading && styles.testButtonDisabled]}
          >
            <Text style={styles.testButtonText}>{testMatchLoading ? 'Joining…' : 'Test'}</Text>
          </Pressable>
        </>
      )}

      {nationals.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>National tournaments</Text>
          <Text style={styles.sectionSubtitle}>4 per year · Free entry</Text>
          {nationals.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              paymentStatus={registrations[t.id]}
              countdownTick={countdownTick}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/(tabs)/modes/tournaments/[id]', params: { id: t.id } } as any);
              }}
            />
          ))}
        </>
      )}

      {!global && tournaments.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="trophy-outline" size={48} color="#64748b" />
          <Text style={styles.emptyText}>No upcoming tournaments</Text>
        </View>
      )}
    </ScrollView>
  );
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function GlobalQuizHero({
  tournament,
  paymentStatus,
  registrationCount,
  countdownTick,
  testMatchLoading,
  onTestMatch,
  onPress,
}: {
  tournament: TournamentRow;
  paymentStatus?: string;
  registrationCount?: number | null;
  countdownTick: number;
  testMatchLoading: boolean;
  onTestMatch: () => void;
  onPress: () => void;
}) {
  const hasFee = (tournament.entry_fee_pence ?? 0) > 0;
  const regOpen = tournament.registration_opens_at
    ? new Date(tournament.registration_opens_at).getTime() <= Date.now()
    : true;
  const countdownReg = countdown(tournament.registration_opens_at);
  const countdownGames = countdown(tournament.games_begin_at);
  const countdownFinals = countdown(tournament.finals_at);
  const isRegistered = paymentStatus === 'paid';
  const cta = isRegistered
    ? 'You\'re in'
    : !regOpen
      ? `Registration opens ${formatDate(tournament.registration_opens_at)}`
      : hasFee
        ? 'Register now · £5'
        : 'Register free';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.heroCard, pressed && styles.heroCardPressed]}>
      <LinearGradient
        colors={['#1c1917', '#292524', '#1a0f05', '#0c0a09']}
        style={styles.heroGradient}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <LinearGradient
        colors={['rgba(245,158,11,0.25)', 'rgba(180,83,9,0.12)', 'transparent', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.heroGlow} />
      <View style={styles.heroTrophyBg} pointerEvents="none">
        <Ionicons name="trophy" size={160} color="rgba(251,191,36,0.06)" />
      </View>
      <View style={styles.heroContent}>
        <View style={styles.heroBadge}>
          <Ionicons name="trophy" size={14} color="#fbbf24" />
          <Text style={styles.heroBadgeText}>FLAGSHIP CHAMPIONSHIP</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {tournament.name || tournament.title || 'The Trivora Global Quiz Rankings'}
        </Text>
        <Text style={styles.heroTagline}>
          The ultimate annual quiz. Climb the rankings, reach the Top 16, and compete in the Live Finals for the title.
        </Text>
        {registrationCount != null && registrationCount > 0 && (
          <View style={styles.heroRegisteredPill}>
            <View style={styles.heroRegisteredPillInner}>
              <Ionicons name="people" size={20} color="#fef08a" />
              <Text style={styles.heroRegisteredPillText}>
                <Text style={styles.heroRegisteredPillNumber}>
                  {registrationCount.toLocaleString()}
                </Text>
                {' '}already in
              </Text>
            </View>
            <Text style={styles.heroRegisteredPillSub}>Join them →</Text>
          </View>
        )}
        <View style={styles.heroStats}>
          {hasFee && (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>£5</Text>
              <Text style={styles.heroStatLabel}>Entry</Text>
            </View>
          )}
          {(tournament.prize_pence ?? 0) > 0 && (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>£{(tournament.prize_pence ?? 0) / 100}</Text>
              <Text style={styles.heroStatLabel}>Prize pool</Text>
            </View>
          )}
          {tournament.finals_top_n && (
            <View style={[styles.heroStat, styles.heroStatHighlight]}>
              <Text style={styles.heroStatValueHighlight}>Top {tournament.finals_top_n}</Text>
              <Text style={styles.heroStatLabelHighlight}>→ Live Finals</Text>
            </View>
          )}
        </View>
        <View style={styles.heroCountdownWrap}>
          {!regOpen && countdownReg && (
            <Text style={styles.heroCountdown}>Registration opens in {countdownReg}</Text>
          )}
          {regOpen && countdownGames && (
            <Text style={styles.heroCountdown}>Games begin in {countdownGames}</Text>
          )}
          {countdownFinals && (
            <Text style={styles.heroCountdownSub}>Finals: {countdownFinals}</Text>
          )}
        </View>
        <View style={styles.heroActions}>
          <Pressable
            style={({ pressed: p }) => [
              styles.heroCta,
              isRegistered && styles.heroCtaRegistered,
              p && styles.heroCtaPressed,
            ]}
            onPress={onPress}
          >
            <Text style={styles.heroCtaText}>{cta}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={onTestMatch}
            disabled={testMatchLoading}
            style={({ pressed: p }) => [
              styles.heroTestBtn,
              p && styles.heroTestBtnPressed,
              testMatchLoading && styles.heroTestBtnDisabled,
            ]}
          >
            <Text style={styles.heroTestBtnText}>{testMatchLoading ? 'Joining…' : 'Test round'}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

function TournamentCard({
  tournament,
  paymentStatus,
  countdownTick,
  onPress,
}: {
  tournament: TournamentRow;
  paymentStatus?: string;
  countdownTick: number;
  onPress: () => void;
}) {
  const isGlobal = tournament.type === 'global';
  const hasFee = (tournament.entry_fee_pence ?? 0) > 0;
  const regOpen = tournament.registration_opens_at
    ? new Date(tournament.registration_opens_at).getTime() <= Date.now()
    : true;
  const countdownReg = countdown(tournament.registration_opens_at);
  const countdownGames = countdown(tournament.games_begin_at);
  const countdownFinals = countdown(tournament.finals_at);
  const cta =
    paymentStatus === 'paid'
      ? 'Registered'
      : !regOpen
        ? `Opens ${formatDate(tournament.registration_opens_at)}`
        : hasFee
          ? 'Register · £5'
          : 'Register';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <LinearGradient
        colors={isGlobal ? ['#b45309', '#92400e'] : ['#475569', '#334155']}
        style={styles.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {tournament.name || tournament.title}
          </Text>
          <View style={styles.badgeWrap}>
            <View style={[styles.badge, paymentStatus === 'paid' ? styles.badgeRegistered : undefined]}>
              <Text style={styles.badgeText}>
                {paymentStatus === 'paid' ? '✓ Registered' : tournament.status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.statsRow}>
          {hasFee && (
            <Text style={styles.stat}>Entry £{(tournament.entry_fee_pence ?? 0) / 100}</Text>
          )}
          {(tournament.prize_pence ?? 0) > 0 && (
            <Text style={styles.stat}>Prize £{(tournament.prize_pence ?? 0) / 100}</Text>
          )}
          {tournament.finals_top_n && (
            <Text style={styles.statHighlight}>Top {tournament.finals_top_n} → Live Finals</Text>
          )}
        </View>
        <View style={styles.countdownRow}>
          {!regOpen && countdownReg && (
            <Text style={styles.countdown}>Reg opens: {countdownReg}</Text>
          )}
          {regOpen && countdownGames && (
            <Text style={styles.countdown}>Games: {countdownGames}</Text>
          )}
          {countdownFinals && (
            <Text style={styles.countdown}>Finals: {countdownFinals}</Text>
          )}
        </View>
        <View style={styles.ctaRow}>
          <Text style={styles.ctaText}>{cta}</Text>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.9)" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, color: '#94a3b8', fontSize: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#f8fafc', marginBottom: 4 },
  sectionSubtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 16 },
  // Global hero
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
    minHeight: 460,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  heroCardPressed: { opacity: 0.98 },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 24,
    margin: 1,
  },
  heroTrophyBg: {
    position: 'absolute',
    bottom: -20,
    right: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContent: {
    padding: 28,
    paddingTop: 32,
    flex: 1,
    justifyContent: 'space-between',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    marginBottom: 20,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fafafa',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  heroTagline: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(248, 250, 252, 0.85)',
    marginBottom: 24,
  },
  heroRegisteredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  heroRegisteredPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroRegisteredPillText: {
    fontSize: 16,
    color: 'rgba(248, 250, 252, 0.95)',
  },
  heroRegisteredPillNumber: {
    fontWeight: '800',
    color: '#fef08a',
    letterSpacing: 0.5,
  },
  heroRegisteredPillSub: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(251, 191, 36, 0.9)',
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 20,
  },
  heroStat: {
    minWidth: 72,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroStatValue: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '600' },
  heroStatHighlight: { backgroundColor: 'rgba(251, 191, 36, 0.2)' },
  heroStatValueHighlight: { fontSize: 18, fontWeight: '800', color: '#fef08a' },
  heroStatLabelHighlight: { fontSize: 11, color: 'rgba(254, 240, 138, 0.9)', marginTop: 2, fontWeight: '600' },
  heroCountdownWrap: { marginBottom: 24 },
  heroCountdown: { fontSize: 15, fontWeight: '700', color: '#fbbf24' },
  heroCountdownSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  heroActions: { gap: 12 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
  },
  heroCtaRegistered: { backgroundColor: 'rgba(34, 197, 94, 0.9)' },
  heroCtaPressed: { opacity: 0.9 },
  heroCtaText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  heroTestBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
  },
  heroTestBtnPressed: { opacity: 0.9 },
  heroTestBtnDisabled: { opacity: 0.5 },
  heroTestBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  // National cards
  card: { borderRadius: 16, overflow: 'hidden', marginBottom: 12, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  cardPressed: { opacity: 0.95 },
  cardGradient: { padding: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#fff', flex: 1 },
  badgeWrap: { marginLeft: 8 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeRegistered: { backgroundColor: 'rgba(34,197,94,0.4)' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  stat: { fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  statHighlight: { fontSize: 13, fontWeight: '700', color: '#fef08a' },
  countdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  countdown: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ctaText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { marginTop: 12, color: '#64748b', fontSize: 16 },
  testButton: { backgroundColor: '#475569', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginBottom: 16, alignSelf: 'flex-start' },
  testButtonPressed: { opacity: 0.9 },
  testButtonDisabled: { opacity: 0.6 },
  testButtonText: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
});
