import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import type { ChampionshipTournament } from '@trivora/core';
import { TOURNAMENT_ENTRY_PRODUCT_ID, verifyTournamentPurchase } from '@/lib/tournament-iap';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const isExpoGo = Constants.appOwnership === 'expo';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const HEADER_OFFSET = 56;

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tournament, setTournament] = useState<(ChampionshipTournament & { starts_at?: string; ends_at?: string }) | null>(null);
  const [registration, setRegistration] = useState<{ payment_status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const pendingIAPRef = useRef<{
    tournamentId: string;
    accessToken: string;
    onVerified: () => void;
  } | null>(null);
  const iapListenersRef = useRef<{ sub: { remove: () => void }; errSub: { remove: () => void } } | null>(null);

  const fetchRegistration = useCallback(async () => {
    if (!id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: regData } = await supabase
      .from('tournament_registrations')
      .select('payment_status')
      .eq('tournament_id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    setRegistration(regData as { payment_status: string } | null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: tData, error: tErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      if (tErr || !tData) {
        setLoading(false);
        return;
      }
      setTournament(tData as ChampionshipTournament & { starts_at?: string; ends_at?: string });
      await fetchRegistration();
      setLoading(false);
    })();
  }, [id, fetchRegistration]);

  useFocusEffect(
    useCallback(() => {
      fetchRegistration();
    }, [fetchRegistration])
  );

  useEffect(() => {
    if (Platform.OS !== 'ios' || isExpoGo) return;
    (async () => {
      const iap = await import('react-native-iap');
      const onPurchaseUpdated = async (purchase: { productId?: string; transactionId?: string }) => {
        if (purchase.productId !== TOURNAMENT_ENTRY_PRODUCT_ID || !pendingIAPRef.current) return;
        const pending = pendingIAPRef.current;
        const txId = purchase.transactionId ?? (purchase as { transactionId?: string }).transactionId;
        if (!txId) return;
        const result = await verifyTournamentPurchase({
          tournamentId: pending.tournamentId,
          transactionId: txId,
          productId: TOURNAMENT_ENTRY_PRODUCT_ID,
          accessToken: pending.accessToken,
        });
        if (result.ok) {
          try {
            await iap.finishTransaction({ purchase, isConsumable: true });
          } catch (_) {}
          pendingIAPRef.current = null;
          pending.onVerified();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          pendingIAPRef.current = null;
          pending.onVerified();
          Alert.alert('Payment issue', result.error ?? 'Could not verify purchase.');
        }
      };
      const sub = iap.purchaseUpdatedListener(onPurchaseUpdated);
      const errSub = iap.purchaseErrorListener((err: { code?: string; message?: string }) => {
        pendingIAPRef.current = null;
        setRegistering(false);
        if (err?.code !== 'E_USER_CANCELLED') {
          Alert.alert('Payment failed', err?.message ?? 'Purchase was not completed.');
        }
      });
      iapListenersRef.current = { sub, errSub };
    })();
    return () => {
      const listeners = iapListenersRef.current;
      if (listeners) {
        listeners.sub.remove();
        listeners.errSub.remove();
        iapListenersRef.current = null;
      }
    };
  }, []);

  const handleRegister = async () => {
    if (!id || !tournament) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to register.');
      return;
    }
    const entryFeePence = tournament.entry_fee_pence ?? 0;

    if (entryFeePence > 0) {
      if (Platform.OS === 'ios') {
        if (isExpoGo) {
          Alert.alert(
            'Use a dev or production build',
            'App Store payment is not available in Expo Go. Run with "expo run:ios" or use an EAS / TestFlight build to pay with Apple.'
          );
          return;
        }
        setRegistering(true);
        try {
          const iap = await import('react-native-iap');
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) {
            Alert.alert('Error', 'Please sign in again and try again.');
            setRegistering(false);
            return;
          }
          await supabase.from('tournament_registrations').upsert(
            { tournament_id: id, user_id: user.id, payment_status: 'unpaid', payment_provider: 'apple' },
            { onConflict: 'tournament_id,user_id' }
          );
          pendingIAPRef.current = {
            tournamentId: id,
            accessToken: token,
            onVerified: () => {
              fetchRegistration();
              setRegistering(false);
            },
          };
          await iap.initConnection();
          const products = await iap.fetchProducts({
            skus: [TOURNAMENT_ENTRY_PRODUCT_ID],
            type: 'in-app',
          });
          if (!products?.length) {
            Alert.alert('Not available', 'Tournament entry is not available in the store. Please try again later.');
            pendingIAPRef.current = null;
            setRegistering(false);
            return;
          }
          await iap.requestPurchase({
            request: { apple: { sku: TOURNAMENT_ENTRY_PRODUCT_ID } },
            type: 'in-app',
          });
        } catch (e) {
          pendingIAPRef.current = null;
          setRegistering(false);
          Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        }
        return;
      }
      setRegistering(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || !SUPABASE_URL) {
          Alert.alert('Error', 'Unable to start payment. Please try again.');
          return;
        }
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-tournament-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tournament_id: id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          Alert.alert('Error', data.error ?? 'Could not start payment.');
          return;
        }
        const url = data.url;
        if (url && (await Linking.canOpenURL(url))) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await Linking.openURL(url);
          setRegistration({ payment_status: 'unpaid' });
        } else {
          Alert.alert('Error', 'Could not open payment page.');
        }
      } catch (e) {
        Alert.alert('Error', 'Something went wrong. Please try again.');
      } finally {
        setRegistering(false);
      }
      return;
    }

    setRegistering(true);
    const { error } = await supabase.from('tournament_registrations').upsert(
      {
        tournament_id: id,
        user_id: user.id,
        payment_status: 'paid',
        payment_provider: 'none',
      },
      { onConflict: 'tournament_id,user_id' }
    );
    setRegistering(false);
    if (error) {
      Alert.alert('Error', error.message || 'Registration failed.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRegistration({ payment_status: 'paid' });
  };

  const addToCalendar = () => {
    const finalsAt = tournament?.finals_at;
    if (!finalsAt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Save the date', `Finals: ${formatDate(finalsAt)} at ${formatTime(finalsAt)}. Add to your calendar manually or we’ll remind you.`);
  };

  if (loading || !tournament) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const isGlobal = tournament.type === 'global';
  const hasFee = (tournament.entry_fee_pence ?? 0) > 0;
  const regOpen = tournament.registration_opens_at
    ? new Date(tournament.registration_opens_at).getTime() <= Date.now()
    : true;
  const isRegistered = !!registration;
  const isPaid = registration?.payment_status === 'paid';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + HEADER_OFFSET }]}
    >
      <LinearGradient
        colors={isGlobal ? ['#b45309', '#92400e'] : ['#475569', '#334155']}
        style={styles.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.heroLabel}>{isGlobal ? 'Global Championship' : 'National'}</Text>
        <Text style={styles.heroTitle}>{tournament.name || tournament.title}</Text>
        {tournament.description ? (
          <Text style={styles.heroDesc} numberOfLines={3}>{tournament.description}</Text>
        ) : null}
        <View style={styles.heroBadges}>
          {hasFee && (
            <View style={styles.badge}><Text style={styles.badgeText}>£{(tournament.entry_fee_pence ?? 0) / 100} entry</Text></View>
          )}
          {(tournament.prize_pence ?? 0) > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>£{(tournament.prize_pence ?? 0) / 100} prize</Text></View>
          )}
          {tournament.finals_top_n && (
            <View style={styles.badgeHighlight}><Text style={styles.badgeTextHighlight}>Top {tournament.finals_top_n} → Live Finals</Text></View>
          )}
        </View>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <View style={styles.timeline}>
          <Row label="Registration opens" value={formatDate(tournament.registration_opens_at)} />
          <Row label="Games begin" value={formatDate(tournament.games_begin_at)} />
          <Row label="Live Finals" value={`${formatDate(tournament.finals_at)} · ${tournament.location_city || 'TBC'}`} />
          {tournament.finals_time_window && (
            <Row label="Finals window" value={tournament.finals_time_window} />
          )}
          <Row label="Awards ceremony" value={`${formatDate(tournament.awards_at)} · ${formatTime(tournament.awards_at)}`} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Format</Text>
        <Text style={styles.body}>
          Elimination rounds (256 → 128 → 64 → 32 → 16). Winners advance. The last 16 qualify for the Live In-Person Finals, streamed live. Champion wins £1,000, trophy & certificate.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Register</Text>
        {isPaid ? (
          <View style={styles.registeredBox}>
            <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
            <View style={styles.registeredText}>
              <Text style={styles.registeredTitle}>You’re registered</Text>
              <Text style={styles.registeredSub}>We’ll notify you when your first match is scheduled.</Text>
            </View>
            <Pressable style={styles.calendarBtn} onPress={addToCalendar}>
              <Ionicons name="calendar-outline" size={20} color="#f59e0b" />
              <Text style={styles.calendarBtnText}>Add to calendar</Text>
            </Pressable>
          </View>
        ) : isRegistered ? (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>Pending payment</Text>
            <Text style={styles.pendingSub}>
              {Platform.OS === 'ios'
                ? `Tap "Pay £${(tournament.entry_fee_pence ?? 0) / 100} & register" below to pay with App Store.`
                : `Complete your £${(tournament.entry_fee_pence ?? 0) / 100} entry in the browser, then return here. If you already paid, pull to refresh.`}
            </Text>
          </View>
        ) : !regOpen ? (
          <View style={styles.closedBox}>
            <Text style={styles.closedText}>Registration opens {formatDate(tournament.registration_opens_at)}</Text>
          </View>
        ) : (
          <View style={styles.registerBox}>
            <Text style={styles.registerDesc}>
              {hasFee
                ? `Entry £${(tournament.entry_fee_pence ?? 0) / 100}. Chance to win, finalist awards, and Live Finals if you make Top 16.`
                : 'Free entry. Register to compete.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.registerBtn, pressed && styles.registerBtnPressed]}
              onPress={handleRegister}
              disabled={registering}
            >
              <LinearGradient
                colors={['#f59e0b', '#d97706']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Text style={styles.registerBtnText}>{registering ? 'Opening payment…' : hasFee ? `Pay £${(tournament.entry_fee_pence ?? 0) / 100} & register` : 'Register now'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Finals</Text>
        <Text style={styles.body}>
          Year 1: London. Venue TBC. Streamed live. Dress: smart. Awards ceremony same evening with special guest. Champion receives trophy & certificate.
        </Text>
        <Text style={styles.todo}>TODO: Venue details & check-in (QR) for qualified players.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bracket & progress</Text>
        <View style={styles.bracketPlaceholder}>
          <Ionicons name="trophy-outline" size={40} color="#64748b" />
          <Text style={styles.bracketPlaceholderText}>Your bracket and round progress will appear here once games begin.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingText: { marginTop: 12, color: '#94a3b8' },
  hero: { padding: 24, paddingTop: 16, paddingBottom: 28 },
  heroLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginBottom: 4, letterSpacing: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 8 },
  heroDesc: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 12 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  badgeHighlight: { backgroundColor: 'rgba(254,240,138,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeTextHighlight: { fontSize: 12, fontWeight: '700', color: '#fef08a' },
  section: { padding: 16, paddingTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 12 },
  timeline: { backgroundColor: 'rgba(30,41,59,0.6)', borderRadius: 12, padding: 16 },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.5)' },
  timelineLabel: { fontSize: 14, color: '#94a3b8' },
  timelineValue: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  body: { fontSize: 14, color: '#cbd5e1', lineHeight: 22 },
  todo: { fontSize: 12, color: '#64748b', marginTop: 8 },
  registeredBox: { backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)' },
  registeredText: { marginTop: 8 },
  registeredTitle: { fontSize: 16, fontWeight: '700', color: '#22c55e' },
  registeredSub: { fontSize: 14, color: '#86efac', marginTop: 4 },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10 },
  calendarBtnText: { fontSize: 15, fontWeight: '600', color: '#f59e0b' },
  pendingBox: { backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 12, padding: 16 },
  pendingTitle: { fontSize: 16, fontWeight: '700', color: '#f59e0b' },
  pendingSub: { fontSize: 14, color: '#fcd34d', marginTop: 4 },
  closedBox: { backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 12, padding: 16 },
  closedText: { fontSize: 14, color: '#94a3b8' },
  registerBox: { backgroundColor: 'rgba(30,41,59,0.6)', borderRadius: 12, padding: 16 },
  registerDesc: { fontSize: 14, color: '#cbd5e1', marginBottom: 16 },
  registerBtn: { overflow: 'hidden', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  registerBtnPressed: { opacity: 0.9 },
  registerBtnText: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  bracketPlaceholder: { backgroundColor: 'rgba(30,41,59,0.6)', borderRadius: 12, padding: 24, alignItems: 'center' },
  bracketPlaceholderText: { marginTop: 12, fontSize: 14, color: '#64748b', textAlign: 'center' },
});
