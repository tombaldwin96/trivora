import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { useResponsive, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { isValidUsername } from '@trivora/core';

type BlockedUser = { blocked_id: string; username: string };

function loginMethodLabel(provider: string | undefined): string {
  if (!provider) return 'Unknown';
  const map: Record<string, string> = {
    apple: 'Apple',
    facebook: 'Facebook',
    google: 'Google',
    email: 'Email',
    phone: 'Phone',
  };
  return map[provider] ?? provider;
}

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark, setTheme } = useTheme();
  const { isTablet } = useResponsive();
  const [loginMethod, setLoginMethod] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockUsernameInput, setBlockUsernameInput] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const loadBlockedUsers = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_blocked_users');
    setBlockedUsers((data ?? []) as BlockedUser[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.dismissAll();
        router.replace('/');
        return;
      }
      setUserId(user.id);
      const provider = user.app_metadata?.provider ?? user.identities?.[0]?.provider ?? 'email';
      setLoginMethod(provider);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      setUsername(profile?.username ?? '');
      setLoading(false);
    })();
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadBlockedUsers();
    }, [loadBlockedUsers])
  );

  async function handleBlockUser() {
    const trimmed = blockUsernameInput.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Enter a username', 'Type the username of the user you want to block.');
      return;
    }
    if (!userId) return;
    setBlocking(true);
    const { data: toIdRaw } = await supabase.rpc('get_user_id_by_username', { p_username: trimmed });
    const toId = Array.isArray(toIdRaw) ? toIdRaw[0] : toIdRaw;
    if (!toId) {
      setBlocking(false);
      Alert.alert('User not found', 'No user found with that username.');
      return;
    }
    if (toId === userId) {
      setBlocking(false);
      Alert.alert('Cannot block yourself', 'You cannot block your own account.');
      return;
    }
    const { data: result } = await supabase.rpc('block_user', { p_blocked_user_id: toId });
    const res = result as { ok?: boolean; error?: string };
    setBlocking(false);
    setBlockUsernameInput('');
    if (res?.ok) {
      loadBlockedUsers();
      Alert.alert('Blocked', `@${trimmed} has been added to your block list.`);
    } else {
      Alert.alert('Error', res?.error === 'user_not_found' ? 'User not found.' : res?.error ?? 'Could not block user.');
    }
  }

  async function handleUnblock(blockedId: string) {
    setUnblockingId(blockedId);
    await supabase.rpc('unblock_user', { p_blocked_user_id: blockedId });
    setUnblockingId(null);
    loadBlockedUsers();
  }

  async function saveUsername() {
    if (!userId) return;
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Invalid username', 'Username cannot be empty.');
      return;
    }
    if (!isValidUsername(trimmed)) {
      Alert.alert(
        'Invalid username',
        'Use 3–24 characters: letters, numbers, and underscores only.'
      );
      return;
    }
    setSaving(true);
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .limit(1)
      .maybeSingle();
    if (existing && existing.id !== userId) {
      setSaving(false);
      Alert.alert('Username taken', 'That username is already in use. Try another.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed })
      .eq('id', userId);

    setSaving(false);
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Username taken', 'That username is already in use. Try another.');
      } else {
        Alert.alert('Error', error.message);
      }
      return;
    }
    setUsernameDirty(false);
    setUsername(trimmed);
    Alert.alert('Saved', 'Your username has been updated.');
  }

  function handleSignOutPress() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: handleSignOut },
      ]
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })
    );
  }

  function handleDeactivatePress() {
    Alert.alert(
      'Deactivate account',
      'Are you sure? Your account and data will be permanently deleted. You will be signed out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, deactivate',
          style: 'destructive',
          onPress: async () => {
            setDeactivating(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                setDeactivating(false);
                router.dismissAll();
                router.replace('/');
                return;
              }
              const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
              if (!url) {
                Alert.alert('Error', 'App not configured.');
                return;
              }
              const res = await fetch(`${url}/functions/v1/deactivate-account`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert('Error', data?.error ?? 'Could not deactivate account.');
                setDeactivating(false);
                return;
              }
              await supabase.auth.signOut();
              router.dismissAll();
              router.replace('/');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
            } finally {
              setDeactivating(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, isDark && styles.centerDark, { paddingTop: insets.top + 24 }]}>
        <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#5b21b6'} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, isDark && styles.flexDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          isDark && styles.containerDark,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          isTablet && { alignItems: 'center' },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.settingsInner, isTablet && { maxWidth: CONTENT_MAX_WIDTH, width: '100%' }]}>
        <Text style={[styles.title, isDark && styles.titleDark]}>Settings</Text>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Appearance</Text>
          <View style={[styles.row, isDark && styles.rowDark]}>
            <Text style={[styles.rowText, isDark && styles.rowTextDark]}>Dark mode</Text>
            <Switch
              value={isDark}
              onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
              trackColor={{ false: '#d1d5db', true: '#7c3aed' }}
              thumbColor="#fff"
            />
          </View>
          <Text style={[styles.hint, isDark && styles.hintDark]}>Light mode when off. Turn on for dark background on all tabs.</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Login method</Text>
          <View style={[styles.row, isDark && styles.rowDark]}>
            <Ionicons name="log-in-outline" size={22} color={isDark ? '#a1a1aa' : '#6b7280'} />
            <Text style={[styles.rowText, isDark && styles.rowTextDark]}>{loginMethodLabel(loginMethod ?? undefined)}</Text>
          </View>
          <Text style={[styles.hint, isDark && styles.hintDark]}>This is how you sign in. It cannot be changed here.</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Profile username</Text>
          <Text style={[styles.hint, isDark && styles.hintDark]}>Your display name for leaderboards and online play. Letters, numbers, underscores; 3–24 characters.</Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              setUsernameDirty(true);
            }}
            placeholder="Username"
            placeholderTextColor={isDark ? '#71717a' : '#9ca3af'}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
          <Pressable
            style={[styles.button, (saving || !usernameDirty) && styles.buttonDisabled]}
            onPress={saveUsername}
            disabled={saving || !usernameDirty}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save username</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Block list</Text>
          <Text style={[styles.hint, isDark && styles.hintDark]}>Blocked users will not be paired with you in games and cannot send or receive friend requests with you.</Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={blockUsernameInput}
            onChangeText={setBlockUsernameInput}
            placeholder="Username to block"
            placeholderTextColor={isDark ? '#71717a' : '#9ca3af'}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!blocking}
          />
          <Pressable
            style={[styles.blockButton, blocking && styles.buttonDisabled]}
            onPress={handleBlockUser}
            disabled={blocking}
          >
            {blocking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Block user</Text>
            )}
          </Pressable>
          {blockedUsers.length > 0 && (
            <View style={[styles.blockedList, isDark && styles.blockedListDark]}>
              {blockedUsers.map((u) => (
                <View key={u.blocked_id} style={[styles.blockedRow, isDark && styles.blockedRowDark]}>
                  <Text style={[styles.blockedUsername, isDark && styles.blockedUsernameDark]} numberOfLines={1}>@{u.username}</Text>
                  <Pressable
                    style={[styles.unblockBtn, isDark && styles.unblockBtnDark]}
                    onPress={() => handleUnblock(u.blocked_id)}
                    disabled={unblockingId !== null}
                  >
                    {unblockingId === u.blocked_id ? (
                      <ActivityIndicator size="small" color="#64748b" />
                    ) : (
                      <Text style={[styles.unblockBtnText, isDark && styles.unblockBtnTextDark]}>Unblock</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Account</Text>
          <Pressable style={[styles.signOut, isDark && styles.signOutDark]} onPress={handleSignOutPress}>
            <Text style={[styles.signOutText, isDark && styles.signOutTextDark]}>Sign out</Text>
          </Pressable>
          <Text style={[styles.hint, isDark && styles.hintDark]}>Sign out of this device. You will need to sign in again to use the app.</Text>
          <Pressable
            style={[styles.deactivate, isDark && styles.deactivateDark]}
            onPress={handleDeactivatePress}
            disabled={deactivating}
          >
            {deactivating ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Text style={[styles.deactivateText, isDark && styles.deactivateTextDark]}>Deactivate account</Text>
            )}
          </Pressable>
          <Text style={[styles.hint, isDark && styles.hintDark]}>Permanently delete your account and all data. This cannot be undone.</Text>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexDark: { backgroundColor: '#0e0e10' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerDark: { backgroundColor: '#0e0e10' },
  container: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  containerDark: { backgroundColor: '#0e0e10' },
  settingsInner: { width: '100%' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  titleDark: { color: '#fff' },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  sectionTitleDark: { color: '#e4e4e7' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowDark: { backgroundColor: '#18181b', borderColor: '#27272a' },
  rowText: {
    fontSize: 16,
    color: '#111827',
  },
  rowTextDark: { color: '#fff' },
  hint: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 10,
  },
  hintDark: { color: '#a1a1aa' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 12,
    color: '#111827',
  },
  inputDark: {
    borderColor: '#27272a',
    backgroundColor: '#18181b',
    color: '#fff',
  },
  button: {
    backgroundColor: '#5b21b6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  blockButton: {
    backgroundColor: '#6b7280',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  blockedList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  blockedListDark: { borderColor: '#27272a' },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  blockedRowDark: { borderBottomColor: '#27272a' },
  blockedUsername: { fontSize: 15, fontWeight: '500', color: '#374151', flex: 1 },
  blockedUsernameDark: { color: '#e4e4e7' },
  unblockBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  unblockBtnDark: { backgroundColor: '#27272a' },
  unblockBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  unblockBtnTextDark: { color: '#a1a1aa' },
  signOut: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    marginBottom: 8,
  },
  signOutText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 16,
  },
  signOutTextDark: { color: '#f87171' },
  signOutDark: { borderColor: '#7f1d1d' },
  deactivate: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dc2626',
    alignItems: 'center',
    marginBottom: 8,
  },
  deactivateDark: { borderColor: '#b91c1c' },
  deactivateText: { color: '#dc2626', fontWeight: '600', fontSize: 16 },
  deactivateTextDark: { color: '#f87171' },
});
