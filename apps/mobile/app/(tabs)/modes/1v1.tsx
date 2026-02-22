import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const QUICK_MATCH_TIMEOUT_MS = 20000;

type MatchRow = { match_id: string; player_a: string; player_b: string | null };

export default function OneVOneScreen() {
  const router = useRouter();
  const [quickMatchLoading, setQuickMatchLoading] = useState(false);
  const [findingOpponentVisible, setFindingOpponentVisible] = useState(false);
  const [findingMessage, setFindingMessage] = useState('Finding opponent…');
  const [noMatchFoundVisible, setNoMatchFoundVisible] = useState(false);
  const [inviteMatchLoading, setInviteMatchLoading] = useState(false);
  const matchmakingStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    supabase.rpc('ensure_user_standing').then(() => {}).catch(() => {});
  }, []);

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
      const { data: newMatchId, error } = await supabase.rpc('create_invite_session');
      if (error) {
        Alert.alert('Error', error.message || 'Could not create session');
        return;
      }
      if (newMatchId) router.replace(`/match/${newMatchId}`);
    } catch (e) {
      Alert.alert('Error', 'Could not start invite session');
    } finally {
      setInviteMatchLoading(false);
    }
  }, [inviteMatchLoading, router]);

  return (
    <LinearGradient
      colors={['#0f172a', '#1e1b4b', '#0f0a1e']}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleAccent} />
            <Text style={styles.title}>1v1 ARENA</Text>
            <View style={styles.titleAccent} />
          </View>
          <Text style={styles.tagline}>Face off. Same questions. Highest score wins.</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelGlow} />
          <View style={styles.panelInner}>
            <Text style={styles.panelLabel}>SELECT MODE</Text>

            <Pressable
              style={({ pressed }) => [
                styles.optionRow,
                styles.optionQuick,
                pressed && styles.optionPressed,
                quickMatchLoading && styles.optionDisabled,
              ]}
              onPress={handleQuickMatch}
              disabled={quickMatchLoading}
            >
              <LinearGradient
                colors={['#15803d', '#166534']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.optionGradient}
              >
                <View style={styles.optionBar} />
                <View style={styles.optionContent}>
                  <Ionicons name="flash" size={28} color="#fef08a" style={styles.optionIcon} />
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>Quick match</Text>
                    <Text style={styles.optionSub}>Find a random opponent · 10 questions · 60 sec each</Text>
                  </View>
                  {quickMatchLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.8)" />
                  )}
                </View>
              </LinearGradient>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.optionRow,
                styles.optionInvite,
                pressed && styles.optionPressed,
                inviteMatchLoading && styles.optionDisabled,
              ]}
              onPress={handleInviteMatch}
              disabled={inviteMatchLoading}
            >
              <LinearGradient
                colors={['#6d28d9', '#5b21b6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.optionGradient}
              >
                <View style={[styles.optionBar, styles.optionBarPurple]} />
                <View style={styles.optionContent}>
                  <Ionicons name="person-add" size={28} color="#e9d5ff" style={styles.optionIcon} />
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>Invite match</Text>
                    <Text style={styles.optionSub}>Send a link or username · Play someone you know</Text>
                  </View>
                  {inviteMatchLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.8)" />
                  )}
                </View>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>

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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 420, alignItems: 'center' },
  header: { marginBottom: 32, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  titleAccent: {
    width: 32,
    height: 3,
    backgroundColor: '#fbbf24',
    borderRadius: 2,
    marginHorizontal: 12,
    opacity: 0.9,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  panel: {
    width: '100%',
    position: 'relative',
    borderRadius: 20,
    padding: 3,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  panelGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  panelInner: {
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    overflow: 'hidden',
  },
  panelLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#fbbf24',
    marginBottom: 16,
    textAlign: 'center',
  },
  optionRow: { marginBottom: 14, borderRadius: 14, overflow: 'hidden' },
  optionQuick: {},
  optionInvite: { marginBottom: 0 },
  optionPressed: { opacity: 0.9 },
  optionDisabled: { opacity: 0.7 },
  optionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 76,
  },
  optionBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#fef08a',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  optionBarPurple: { backgroundColor: '#e9d5ff' },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  optionIcon: { marginRight: 14 },
  optionTextWrap: { flex: 1 },
  optionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  optionSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
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
});
