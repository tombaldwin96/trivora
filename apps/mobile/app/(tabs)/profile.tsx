import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { DIVISION_NAMES } from '@mahan/core';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';

function countryToFlagEmoji(countryCode: string) {
  if (!countryCode || countryCode.length !== 2) return null;
  const code = countryCode.toUpperCase();
  const a = 0x1f1e6; // Regional Indicator A
  return String.fromCodePoint(...[...code].map((c) => a + (c.charCodeAt(0) - 65)));
}

export default function ProfileTab() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [profile, setProfile] = useState<{ username?: string; display_name?: string; country?: string; created_at?: string } | null>(null);
  const [standing, setStanding] = useState<{ division: number; points: number; wins: number; draws: number; losses: number } | null>(null);
  const [quizzesPlayed, setQuizzesPlayed] = useState<number>(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
      supabase.from('profiles').select('username, display_name, country, created_at').eq('id', user.id).single().then(({ data }) => setProfile(data ?? null));
      supabase.from('standings').select('division, points, wins, draws, losses').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setStanding(data ?? null));
      supabase.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('ended_at', 'is', null).then(({ count }) => setQuizzesPlayed(count ?? 0));
    });
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  const name = profile?.display_name || profile?.username || '—';
  const sub = standing
    ? `Division ${standing.division} · ${standing.points} pts · ${standing.wins}W ${standing.draws}D ${standing.losses}L`
    : '@' + (profile?.username ?? '—');

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const countryDisplay = profile?.country ?? '—';
  const flagEmoji = profile?.country ? countryToFlagEmoji(profile.country) : null;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.profileRow}>
          <Image source={{ uri: PLACEHOLDER_IMAGES.profile }} style={styles.avatar} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, isDark && styles.profileNameDark]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.profileSub, isDark && styles.profileSubDark]} numberOfLines={1}>{sub}</Text>
            <Pressable style={styles.changePhotoWrap}>
              <Ionicons name="camera-outline" size={16} color={isDark ? '#a78bfa' : '#7c3aed'} />
              <Text style={[styles.changePhotoText, isDark && styles.changePhotoTextDark]}>Change profile picture</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.statTitle, isDark && styles.statTitleDark]}>Your stats</Text>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Quizzes played</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{quizzesPlayed}</Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Wins / Draws / Losses</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>
            {standing ? `${standing.wins} / ${standing.draws} / ${standing.losses}` : '0 / 0 / 0'}
          </Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Joined</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{joinedDate}</Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Country</Text>
          <View style={styles.countryWrap}>
            {flagEmoji ? <Text style={styles.flagEmoji}>{flagEmoji}</Text> : <Ionicons name="flag-outline" size={20} color={isDark ? '#a1a1aa' : '#64748b'} />}
            <Text style={[styles.statValue, isDark && styles.statValueDark]}>{countryDisplay}</Text>
          </View>
        </View>
        {standing && (
          <View style={[styles.statRow, isDark && styles.statRowDark]}>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Division</Text>
            <Text style={[styles.statValue, isDark && styles.statValueDark]}>
              {standing.division} ({DIVISION_NAMES[standing.division] ?? 'Starter'})
            </Text>
          </View>
        )}
      </View>
      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={[styles.signOutText, isDark && styles.signOutTextDark]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardDark: { backgroundColor: '#18181b', borderColor: '#26262c' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e2e8f0' },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 2 },
  profileNameDark: { color: '#fafafa' },
  profileSub: { fontSize: 14, color: '#64748b', marginBottom: 10 },
  profileSubDark: { color: '#a1a1aa' },
  changePhotoWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  changePhotoText: { fontSize: 14, fontWeight: '500', color: '#7c3aed' },
  changePhotoTextDark: { color: '#a78bfa' },
  statTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  statTitleDark: { color: '#efeff1' },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  statRowDark: { borderBottomColor: '#27272a' },
  statLabel: { fontSize: 14, color: '#64748b' },
  statLabelDark: { color: '#a1a1aa' },
  statValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  statValueDark: { color: '#e4e4e7' },
  countryWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flagEmoji: { fontSize: 20 },
  signOut: { marginTop: 24 },
  signOutText: { color: '#dc2626', textAlign: 'center' },
  signOutTextDark: { color: '#f87171' },
});
