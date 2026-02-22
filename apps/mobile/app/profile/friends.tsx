import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
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
  h2h_wins?: number;
  h2h_draws?: number;
  h2h_losses?: number;
};

type FriendRow = {
  friend_id: string;
  username: string | null;
  last_seen_at: string | null;
  is_online: boolean;
};

type PendingRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  from_username?: string;
};

type SentRequest = {
  id: string;
  to_user_id: string;
  to_username?: string;
};

const ONLINE_MINUTES = 5;

const HEADER_HEIGHT = 44;

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pendingReceived, setPendingReceived] = useState<PendingRequest[]>([]);
  const [pendingSent, setPendingSent] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [cardData, setCardData] = useState<ProfileCardData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [friendAvatars, setFriendAvatars] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myId = user?.id ?? '';
      const [friendsRes, pendingRes, sentRes] = await Promise.all([
        supabase.rpc('get_my_friends_with_status'),
        supabase
          .from('friend_requests')
          .select('id, from_user_id, to_user_id, status, created_at')
          .eq('to_user_id', myId)
          .eq('status', 'pending'),
        supabase
          .from('friend_requests')
          .select('id, to_user_id')
          .eq('from_user_id', myId)
          .eq('status', 'pending'),
      ]);
      const list = (friendsRes.data ?? []) as FriendRow[];
      setFriends(list);
      if (list.length > 0) {
        const friendIds = list.map((f) => f.friend_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', friendIds);
        const avatarMap: Record<string, string | null> = {};
        (profiles ?? []).forEach((p: { id: string; avatar_url: string | null }) => {
          avatarMap[p.id] = p.avatar_url ?? null;
        });
        setFriendAvatars(avatarMap);
      } else {
        setFriendAvatars({});
      }
      const pending = (pendingRes.data ?? []) as PendingRequest[];
        if (pending.length > 0) {
        const ids = [...new Set(pending.map((p) => p.from_user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', ids);
        const map = Object.fromEntries((profiles ?? []).map((p: { id: string; username: string }) => [p.id, p]));
        setPendingReceived(
          pending.map((p) => ({
            ...p,
            from_username: map[p.from_user_id]?.username,
          }))
        );
      } else {
        setPendingReceived([]);
      }
      const sent = (sentRes.data ?? []) as { id: string; to_user_id: string }[];
      if (sent.length > 0) {
        const toIds = [...new Set(sent.map((s) => s.to_user_id))];
        const { data: toProfiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', toIds);
        const toMap = Object.fromEntries((toProfiles ?? []).map((p: { id: string; username: string }) => [p.id, p]));
        setPendingSent(
          sent.map((s) => ({
            id: s.id,
            to_user_id: s.to_user_id,
            to_username: toMap[s.to_user_id]?.username,
          }))
        );
      } else {
        setPendingSent([]);
      }
    } catch {
      setFriends([]);
      setPendingReceived([]);
      setPendingSent([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  async function openProfileCard(userId: string) {
    setCardModalVisible(true);
    setCardLoading(true);
    setCardData(null);
    const { data: { user: me } } = await supabase.auth.getUser();
    const { data } = await supabase.rpc('get_user_profile_card', {
      p_user_id: userId,
      p_viewer_id: me?.id ?? null,
    });
    setCardLoading(false);
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
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
        h2h_wins: Number(d.h2h_wins) ?? 0,
        h2h_draws: Number(d.h2h_draws) ?? 0,
        h2h_losses: Number(d.h2h_losses) ?? 0,
      });
    }
  }

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

  const searchUsers = useCallback(async () => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${q}%`)
        .eq('is_blocked', false)
        .neq('id', user?.id ?? '')
        .limit(15);
      setSearchResults((data ?? []) as { id: string; username: string }[]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(searchUsers, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchUsers]);

  const sendRequest = async (toUserId: string) => {
    setSendingRequest(toUserId);
    try {
      const { data } = await supabase.rpc('send_friend_request', { p_to_user_id: toUserId });
      const result = data as { ok?: boolean; error?: string };
      if (result?.ok) {
        setSearchResults((prev) => prev.filter((u) => u.id !== toUserId));
        Alert.alert('Request sent', 'They\'ll see your request in their Friends list.');
      } else {
        Alert.alert('Couldn\'t send', result?.error === 'already_friends' ? 'You\'re already friends.' : result?.error === 'request_exists' ? 'Request already sent.' : result?.error === 'blocked' ? 'You cannot send a friend request to this user.' : result?.error === 'rate_limit' ? 'You can only send 20 friend requests per day. Try again tomorrow.' : result?.error ?? 'Try again.');
      }
    } catch {
      Alert.alert('Error', 'Could not send request.');
    } finally {
      setSendingRequest(null);
    }
  };

  const acceptRequest = async (requestId: string) => {
    setAcceptingId(requestId);
    try {
      const { data } = await supabase.rpc('accept_friend_request', { p_request_id: requestId });
      const result = data as { ok?: boolean; error?: string };
      if (result?.ok) {
        setPendingReceived((prev) => prev.filter((r) => r.id !== requestId));
        load();
      } else if (result?.error === 'blocked') {
        Alert.alert('Cannot accept', 'You cannot add this user as a friend.');
        load();
      }
    } catch {
      Alert.alert('Error', 'Could not accept.');
    } finally {
      setAcceptingId(null);
    }
  };

  const declineRequest = async (requestId: string) => {
    setDecliningId(requestId);
    try {
      await supabase.rpc('decline_friend_request', { p_request_id: requestId });
      setPendingReceived((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      Alert.alert('Error', 'Could not decline.');
    } finally {
      setDecliningId(null);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0c0c14', '#12121a', '#0a0a10']} style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#a78bfa" />
        <Text style={styles.loadingLabel}>Loading friends...</Text>
      </LinearGradient>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, styles.contentGrow, { paddingTop: insets.top + HEADER_HEIGHT + 12 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#a78bfa" />}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#0c0c14', '#12121a', '#0a0a10']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* ADD FRIENDS */}
      <View style={styles.card}>
        <View style={styles.cardAccent} />
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="person-add" size={20} color="#fbbf24" />
          </View>
          <Text style={styles.sectionTitle}>ADD FRIENDS</Text>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color="#71717a" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by username..."
            placeholderTextColor="#52525b"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {searching && (
          <View style={styles.searchingRow}>
            <ActivityIndicator size="small" color="#a78bfa" />
            <Text style={styles.searchingText}>Searching...</Text>
          </View>
        )}
        {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
          <Text style={styles.hint}>No users found</Text>
        )}
        {searchResults.map((u) => (
          <View key={u.id} style={styles.searchRow}>
            <Pressable
              style={({ pressed }) => [styles.searchRowPressable, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: u.id } })}
            >
              <View style={styles.searchRowAccent} />
              <Text style={styles.searchName}>@{u.username}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.addBtnWrap, pressed && styles.pressed]}
              onPress={() => sendRequest(u.id)}
              disabled={sendingRequest !== null}
            >
              <LinearGradient colors={['#a78bfa', '#7c3aed', '#5b21b6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.addBtn, sendingRequest === u.id && styles.addBtnDisabled]}>
                {sendingRequest === u.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addBtnText}>ADD</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        ))}
      </View>

      {/* SENT */}
      {pendingSent.length > 0 && (
        <View style={styles.card}>
          <View style={[styles.cardAccent, styles.cardAccentAmber]} />
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.sectionIconWrapAmber]}>
              <Ionicons name="send" size={18} color="#fbbf24" />
            </View>
            <Text style={styles.sectionTitle}>SENT</Text>
          </View>
          {pendingSent.map((s) => (
            <Pressable
              key={s.id}
              style={({ pressed }) => [styles.sentRow, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: s.to_user_id } })}
            >
              <View style={styles.sentRowAccent} />
              <Text style={styles.sentUsername}>@{s.to_username ?? '—'}</Text>
              <View style={styles.pendingPill}>
                <Text style={styles.pendingPillText}>PENDING</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* REQUESTS */}
      {pendingReceived.length > 0 && (
        <View style={styles.card}>
          <View style={[styles.cardAccent, styles.cardAccentGreen]} />
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, styles.sectionIconWrapGreen]}>
              <Ionicons name="mail-unread" size={18} color="#22c55e" />
            </View>
            <Text style={styles.sectionTitle}>REQUESTS</Text>
          </View>
          {pendingReceived.map((r) => (
            <View key={r.id} style={styles.requestRow}>
              <View style={styles.requestRowAccent} />
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>@{r.from_username ?? '—'}</Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable style={[styles.declineBtn, decliningId === r.id && styles.btnDisabled]} onPress={() => declineRequest(r.id)} disabled={decliningId === r.id}>
                  {decliningId === r.id ? <ActivityIndicator size="small" color="#71717a" /> : <Text style={styles.declineBtnText}>Decline</Text>}
                </Pressable>
                <Pressable style={[styles.acceptBtnWrap, acceptingId === r.id && styles.btnDisabled]} onPress={() => acceptRequest(r.id)} disabled={acceptingId === r.id}>
                  <LinearGradient colors={['#34d399', '#22c55e', '#16a34a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.acceptBtn}>
                    {acceptingId === r.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.acceptBtnText}>Accept</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* FRIENDS */}
      <View style={[styles.card, styles.squadCard]}>
        <View style={[styles.cardAccent, styles.cardAccentPurple]} />
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, styles.sectionIconWrapPurple]}>
            <Ionicons name="people" size={20} color="#a78bfa" />
          </View>
          <Text style={styles.sectionTitle}>FRIENDS</Text>
        </View>
        <View style={styles.squadCardContent}>
        {friends.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={40} color="#3f3f46" />
            </View>
            <Text style={styles.emptyTitle}>No friends yet</Text>
            <Text style={styles.emptySub}>Search above or accept requests to add friends.</Text>
          </View>
        ) : (
          friends.map((f) => (
            <Pressable
              key={f.friend_id}
              style={({ pressed }) => [styles.friendRow, pressed && styles.pressed]}
              onPress={() => openProfileCard(f.friend_id)}
            >
              <View style={styles.friendRowAccent} />
              <View style={[styles.friendAvatarWrap, f.is_online && styles.friendAvatarOnline]}>
                <Image
                  source={{ uri: friendAvatars[f.friend_id] || PLACEHOLDER_IMAGES.profile }}
                  style={styles.friendAvatarImg}
                />
              </View>
              <View style={styles.friendRowInner}>
                <Text style={styles.friendName}>@{f.username ?? '—'}</Text>
              </View>
              <View style={[styles.onlinePill, f.is_online ? styles.onlinePillOn : styles.onlinePillOff]}>
                <View style={[styles.onlineDot, f.is_online && styles.onlineDotGreen]} />
                <Text style={[styles.onlinePillText, f.is_online && styles.onlinePillTextOn]}>{f.is_online ? 'ONLINE' : 'OFFLINE'}</Text>
              </View>
            </Pressable>
          ))
        )}
        </View>
      </View>

      <Modal visible={cardModalVisible} transparent animationType="fade">
        <Pressable style={styles.cardModalBackdrop} onPress={() => setCardModalVisible(false)}>
          <Pressable style={styles.cardModal} onPress={(e) => e.stopPropagation()}>
            {cardLoading ? (
              <ActivityIndicator size="large" color="#a78bfa" style={styles.cardLoader} />
            ) : cardData ? (
              <>
                <View style={styles.cardAvatarWrap}>
                  <Image
                    source={{ uri: cardData.avatar_url || PLACEHOLDER_IMAGES.profile }}
                    style={styles.cardAvatar}
                  />
                </View>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>@{cardData.username}</Text>
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
                          ['#4c1d95', '#6d28d9', '#8b5cf6', '#6d28d9']
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
                  <View style={styles.cardBioWrap}>
                    <Text style={styles.cardBio}>{cardData.bio}</Text>
                  </View>
                ) : null}
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Level / XP</Text>
                  <Text style={styles.cardValue}>{cardData.level} · {cardData.xp} XP</Text>
                </View>
                {cardData.country ? (
                  <View style={styles.cardStatRow}>
                    <Text style={styles.cardLabel}>Country</Text>
                    <View style={styles.cardCountryValue}>
                      {countryToFlagEmoji(cardData.country) ? (
                        <Text style={styles.cardCountryFlag}>{countryToFlagEmoji(cardData.country)}</Text>
                      ) : null}
                      <Text style={styles.cardValue}>{countryCodeToName(cardData.country)}</Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>W-D-L</Text>
                  <Text style={styles.cardValue}>{cardData.total_wins}-{cardData.total_draws}-{cardData.total_losses}</Text>
                </View>
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Your record vs them</Text>
                  <Text style={styles.cardValue}>{cardData.h2h_wins ?? 0}-{cardData.h2h_draws ?? 0}-{cardData.h2h_losses ?? 0}</Text>
                </View>
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Live quizzes participated</Text>
                  <Text style={styles.cardValue}>{cardData.live_quizzes_participated ?? 0}</Text>
                </View>
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Live quiz top 10 finish</Text>
                  <Text style={styles.cardValue}>{cardData.live_quiz_top_10_finishes ?? 0}</Text>
                </View>
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Live quiz wins</Text>
                  <Text style={styles.cardValue}>{cardData.live_quiz_win_count ?? 0}</Text>
                </View>
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Quizzes completed</Text>
                  <Text style={styles.cardValue}>{cardData.total_quizzes_completed}</Text>
                </View>
                <View style={styles.cardStatRow}>
                  <Text style={styles.cardLabel}>Date joined</Text>
                  <Text style={styles.cardValue}>{formatJoinedDate(cardData.joined_at)}</Text>
                </View>
                <Pressable
                  style={styles.cardInviteBtn}
                  onPress={handleInviteFromCard}
                  disabled={inviteSending}
                >
                  {inviteSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.cardInviteText}>Invite to game</Text>
                  )}
                </Pressable>
                <Pressable style={styles.cardCloseBtn} onPress={() => setCardModalVisible(false)}>
                  <Text style={styles.cardCloseText}>Close</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.cardError}>Could not load profile.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a10' },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingLabel: { fontSize: 15, fontWeight: '600', color: '#71717a' },
  content: { padding: 16, paddingBottom: 48 },
  contentGrow: { flexGrow: 1 },
  squadCard: { flex: 1, marginBottom: 0 },
  squadCardContent: { flex: 1 },
  card: {
    backgroundColor: 'rgba(22, 22, 28, 0.95)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(63, 63, 70, 0.8)',
    overflow: 'hidden',
    position: 'relative',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#a78bfa',
  },
  cardAccentAmber: { backgroundColor: '#f59e0b' },
  cardAccentGreen: { backgroundColor: '#22c55e' },
  cardAccentPurple: { backgroundColor: '#7c3aed' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconWrapAmber: { backgroundColor: 'rgba(251, 191, 36, 0.2)' },
  sectionIconWrapGreen: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  sectionIconWrapPurple: { backgroundColor: 'rgba(124, 58, 237, 0.25)' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#a1a1aa', letterSpacing: 1.2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(39, 39, 42, 0.9)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(63, 63, 70, 0.8)',
    marginBottom: 12,
  },
  searchIcon: { marginLeft: 14 },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#fafafa',
  },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  searchingText: { fontSize: 14, color: '#71717a', fontWeight: '500' },
  hint: { fontSize: 14, color: '#71717a', marginBottom: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(63, 63, 70, 0.5)',
  },
  searchRowPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  searchRowAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(167, 139, 250, 0.5)',
  },
  searchName: { fontSize: 16, fontWeight: '700', color: '#fafafa', marginLeft: 12 },
  addBtnWrap: { marginLeft: 8 },
  addBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.8 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  pressed: { opacity: 0.85 },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(63, 63, 70, 0.5)',
    position: 'relative',
  },
  sentRowAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.5)',
  },
  sentUsername: { fontSize: 16, fontWeight: '700', color: '#fafafa', marginLeft: 12, flex: 1 },
  pendingPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  pendingPillText: { fontSize: 11, fontWeight: '700', color: '#fbbf24', letterSpacing: 0.5 },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(63, 63, 70, 0.5)',
    position: 'relative',
  },
  requestRowAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(34, 197, 94, 0.4)',
  },
  requestInfo: { flex: 1, marginLeft: 12 },
  requestName: { fontSize: 16, fontWeight: '700', color: '#fafafa' },
  requestUsername: { fontSize: 14, color: '#71717a', marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(63, 63, 70, 0.8)',
  },
  declineBtnText: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
  btnDisabled: { opacity: 0.7 },
  acceptBtnWrap: { overflow: 'hidden', borderRadius: 12 },
  acceptBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(63, 63, 70, 0.5)',
    position: 'relative',
  },
  friendRowAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(167, 139, 250, 0.4)',
  },
  friendAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginLeft: 12,
  },
  friendAvatarImg: { width: '100%', height: '100%' },
  friendAvatarOnline: { borderWidth: 2, borderColor: 'rgba(34, 197, 94, 0.6)' },
  friendRowInner: { flex: 1, marginLeft: 14 },
  friendName: { fontSize: 16, fontWeight: '700', color: '#fafafa' },
  friendUsername: { fontSize: 14, color: '#71717a', marginTop: 2 },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  onlinePillOn: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  onlinePillOff: { backgroundColor: 'rgba(63, 63, 70, 0.6)' },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#52525b',
  },
  onlineDotGreen: { backgroundColor: '#22c55e' },
  onlinePillText: { fontSize: 11, fontWeight: '700', color: '#a1a1aa', letterSpacing: 0.3 },
  onlinePillTextOn: { color: '#22c55e' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(63, 63, 70, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#d4d4d8', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#71717a', textAlign: 'center' },
  cardModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cardModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#18181b',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#27272a',
  },
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
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#fafafa', textAlign: 'center' },
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
    color: '#1c1917',
  },
  rankBadgeTextMedal: {
    color: '#1c1917',
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
  cardBioWrap: { marginBottom: 16, paddingHorizontal: 4 },
  cardBio: { fontSize: 14, color: '#a1a1aa', lineHeight: 20, textAlign: 'center' },
  cardStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  cardLabel: { fontSize: 15, color: '#a1a1aa' },
  cardValue: { fontSize: 15, fontWeight: '600', color: '#e4e4e7' },
  cardCountryValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCountryFlag: { fontSize: 18 },
  cardInviteBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  cardInviteText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cardCloseBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6d28d9',
    alignItems: 'center',
  },
  cardCloseText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cardError: { color: '#a1a1aa', textAlign: 'center', padding: 20 },
});
