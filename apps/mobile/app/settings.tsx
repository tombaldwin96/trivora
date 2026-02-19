import { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { isValidUsername } from '@mahan/core';

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
  const insets = useSafeAreaInsets();
  const { isDark, setTheme } = useTheme();
  const [loginMethod, setLoginMethod] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
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
        ]}
        keyboardShouldPersistTaps="handled"
      >
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
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Account</Text>
          <Pressable style={[styles.signOut, isDark && styles.signOutDark]} onPress={handleSignOut}>
            <Text style={[styles.signOutText, isDark && styles.signOutTextDark]}>Sign out</Text>
          </Pressable>
          <Text style={[styles.hint, isDark && styles.hintDark]}>Sign out of this device. You will need to sign in again to use the app.</Text>
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
});
