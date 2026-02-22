import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';
import { levelFromXp } from '@/lib/xp-context';
import { countryToFlagEmoji, countryCodeToName } from '@/lib/country';

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  country: string | null;
  xp: number;
  avatar_url?: string | null;
  bio?: string | null;
  total_quizzes_taken?: number;
};

export default function ProfileByIdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<'none' | 'friends' | 'pending_sent' | 'pending_received' | 'can_request'>('none');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [inviteMatchLoading, setInviteMatchLoading] = useState(false);
  const [removingFriend, setRemovingFriend] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me) {
        setLoading(false);
        return;
      }
      if (id === me.id) {
        router.replace('/(tabs)/profile');
        return;
      }
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, display_name, country, xp, avatar_url, bio, total_quizzes_taken')
        .eq('id', id)
        .single();
      setProfile(profileData as ProfileRow | null);
      if (!profileData) {
        setLoading(false);
        return;
      }
      const [friendsRes, reqSent, reqReceived] = await Promise.all([
        supabase.from('friends').select('id').or(`and(user_id.eq.${me.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${me.id})`).limit(1),
        supabase.from('friend_requests').select('id').eq('from_user_id', me.id).eq('to_user_id', id).eq('status', 'pending').maybeSingle(),
        supabase.from('friend_requests').select('id').eq('from_user_id', id).eq('to_user_id', me.id).eq('status', 'pending').maybeSingle(),
      ]);
      if (friendsRes.data && friendsRes.data.length > 0) setFriendStatus('friends');
      else if (reqSent.data) setFriendStatus('pending_sent');
      else if (reqReceived.data) setFriendStatus('pending_received');
      else setFriendStatus('can_request');
      setLoading(false);
    })();
  }, [id, router]);

  const sendRequest = async () => {
    if (!id || friendStatus !== 'can_request') return;
    setSendingRequest(true);
    try {
      const { data } = await supabase.rpc('send_friend_request', { p_to_user_id: id });
      const result = data as { ok?: boolean; error?: string };
      if (result?.ok) {
        setFriendStatus('pending_sent');
        Alert.alert('Request sent', 'They can accept in their Friends page.');
      } else {
        Alert.alert('Couldn\'t send', result?.error === 'already_friends' ? 'You\'re already friends.' : result?.error === 'blocked' ? 'You cannot send a friend request to this user.' : result?.error === 'rate_limit' ? 'You can only send 20 friend requests per day. Try again tomorrow.' : result?.error ?? 'Try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not send request.');
    } finally {
      setSendingRequest(false);
    }
  };

  const inviteTo1v1 = async () => {
    if (!profile?.username || inviteMatchLoading) return;
    setInviteMatchLoading(true);
    try {
      const { data: newMatchId, error: createErr } = await supabase.rpc('create_invite_session');
      if (createErr || !newMatchId) {
        Alert.alert('Error', createErr?.message ?? 'Could not start match');
        return;
      }
      const matchId = Array.isArray(newMatchId) ? newMatchId[0] : newMatchId;
      // Same as "Invite match" from 1v1: go to match screen with username pre-filled; match screen will send invite
      router.replace(`/match/${matchId}?inviteUsername=${encodeURIComponent(profile.username)}` as any);
    } catch {
      Alert.alert('Error', 'Could not start invite');
    } finally {
      setInviteMatchLoading(false);
    }
  };

  const removeFriend = async () => {
    if (!id || friendStatus !== 'friends' || removingFriend) return;
    Alert.alert(
      'Remove friend',
      `Remove @${profile?.username ?? 'this user'} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingFriend(true);
            try {
              const { data: { user: me } } = await supabase.auth.getUser();
              if (!me?.id) return;
              await supabase.from('friends').delete().eq('user_id', me.id).eq('friend_id', id);
              await supabase.from('friends').delete().eq('user_id', id).eq('friend_id', me.id);
              setFriendStatus('can_request');
              router.back();
            } catch {
              Alert.alert('Error', 'Could not remove friend.');
            } finally {
              setRemovingFriend(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, styles.container, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.centered, styles.container, isDark && styles.containerDark]}>
        <Text style={[styles.error, isDark && styles.errorDark]}>Profile not found</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const name = profile.display_name || profile.username || '—';
  const level = levelFromXp(profile.xp ?? 0);
  const countryDisplay = countryCodeToName(profile.country);
  const flagEmoji = profile.country ? countryToFlagEmoji(profile.country) : null;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.content}>
        <View style={styles.avatarSection}>
          <View style={[styles.avatarRing, isDark && styles.avatarRingDark]}>
            <Image
              source={{ uri: profile.avatar_url || PLACEHOLDER_IMAGES.profile }}
              style={styles.avatarImage}
            />
          </View>
          <Text style={[styles.avatarName, isDark && styles.avatarNameDark]} numberOfLines={2}>{name}</Text>
          <Text style={[styles.avatarSub, isDark && styles.avatarSubDark]} numberOfLines={1}>@{profile.username}</Text>
        </View>
        {profile.bio ? (
          <View style={[styles.bioCard, isDark && styles.cardDark]}>
            <Text style={[styles.bioLabel, isDark && styles.bioLabelDark]}>Bio</Text>
            <Text style={[styles.bioText, isDark && styles.bioTextDark]}>{profile.bio}</Text>
          </View>
        ) : null}
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={[styles.row, isDark && styles.rowDark]}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Level</Text>
            <Text style={[styles.value, isDark && styles.valueDark]}>{level}</Text>
          </View>
          <View style={[styles.row, isDark && styles.rowDark]}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Total quizzes</Text>
            <Text style={[styles.value, isDark && styles.valueDark]}>{profile.total_quizzes_taken ?? 0}</Text>
          </View>
          {countryDisplay && (
            <View style={[styles.row, isDark && styles.rowDark]}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Country</Text>
              <View style={styles.countryRow}>
                {flagEmoji ? <Text style={styles.flag}>{flagEmoji}</Text> : null}
                <Text style={[styles.value, isDark && styles.valueDark]}>{countryDisplay}</Text>
              </View>
            </View>
          )}
        </View>

        {friendStatus === 'friends' && (
          <>
            <View style={[styles.badge, styles.badgeFriends]}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.badgeText}>Friends</Text>
            </View>
            <Pressable
              style={[styles.invite1v1Btn, inviteMatchLoading && styles.invite1v1BtnDisabled]}
              onPress={inviteTo1v1}
              disabled={inviteMatchLoading}
            >
              {inviteMatchLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="game-controller" size={20} color="#fff" />
                  <Text style={styles.invite1v1BtnText}>Invite to game</Text>
                </>
              )}
            </Pressable>
          </>
        )}
        {friendStatus === 'pending_sent' && (
          <View style={[styles.badge, styles.badgePending]}>
            <Text style={styles.badgePendingText}>Request sent</Text>
          </View>
        )}
        {friendStatus === 'pending_received' && (
          <Text style={[styles.hint, isDark && styles.hintDark]}>They sent you a request. Accept in Friends.</Text>
        )}
        {friendStatus === 'can_request' && (
          <Pressable
            style={[styles.addBtn, sendingRequest && styles.addBtnDisabled]}
            onPress={sendRequest}
            disabled={sendingRequest}
          >
            {sendingRequest ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add" size={20} color="#fff" />
                <Text style={styles.addBtnText}>Add as friend</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {friendStatus === 'friends' && (
        <View style={[styles.removeFriendWrap, isDark && styles.removeFriendWrapDark, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable
            style={[styles.removeFriendBtn, isDark && styles.removeFriendBtnDark]}
            onPress={removeFriend}
            disabled={removingFriend}
          >
            {removingFriend ? (
              <ActivityIndicator size="small" color="#64748b" />
            ) : (
              <Text style={[styles.removeFriendBtnText, isDark && styles.removeFriendBtnTextDark]}>Remove friend</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 8 },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#e2e8f0',
  },
  avatarRingDark: { borderColor: '#3f3f46' },
  avatarImage: { width: '100%', height: '100%' },
  avatarName: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center', marginTop: 12 },
  avatarNameDark: { color: '#fafafa' },
  avatarSub: { fontSize: 14, color: '#64748b', marginTop: 4, textAlign: 'center' },
  avatarSubDark: { color: '#a1a1aa' },
  bioCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bioLabel: { fontSize: 14, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  bioLabelDark: { color: '#a1a1aa' },
  bioText: { fontSize: 15, color: '#374151', lineHeight: 22 },
  bioTextDark: { color: '#d4d4d8' },
  removeFriendWrap: { paddingVertical: 24, paddingBottom: 32, alignItems: 'center', justifyContent: 'center' },
  removeFriendWrapDark: {},
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardDark: { backgroundColor: '#18181b', borderColor: '#27272a' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowDark: { borderBottomColor: '#27272a' },
  label: { fontSize: 14, color: '#64748b' },
  labelDark: { color: '#a1a1aa' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827' },
  valueDark: { color: '#e4e4e7' },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flag: { fontSize: 18 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeFriends: { backgroundColor: 'rgba(34, 197, 94, 0.15)' },
  badgePending: { backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 16, fontWeight: '600', color: '#22c55e' },
  badgePendingText: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  hint: { fontSize: 14, color: '#64748b', marginTop: 16 },
  hintDark: { color: '#a1a1aa' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
  },
  addBtnDisabled: { opacity: 0.7 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  invite1v1Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#f97316',
    borderRadius: 12,
  },
  invite1v1BtnDisabled: { opacity: 0.7 },
  invite1v1BtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  removeFriendBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  removeFriendBtnDark: {},
  removeFriendBtnText: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  removeFriendBtnTextDark: { color: '#71717a' },
  error: { fontSize: 16, color: '#64748b' },
  errorDark: { color: '#a1a1aa' },
  backBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 },
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#7c3aed' },
});
