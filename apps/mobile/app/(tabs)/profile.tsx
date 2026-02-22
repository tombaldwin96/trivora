import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform, Keyboard, Image, ActivityIndicator, Modal, FlatList } from 'react-native';

let InputAccessoryView: React.ComponentType<{ nativeID: string; children?: React.ReactNode }> | null = null;
if (Platform.OS === 'ios') {
  try {
    InputAccessoryView = require('react-native').InputAccessoryView ?? null;
  } catch {
    InputAccessoryView = null;
  }
}
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { levelFromXp } from '@/lib/xp-context';
import { Link } from 'expo-router';
import { PLACEHOLDER_IMAGES } from '@/lib/placeholder-images';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
import { isUsernameAllowed } from '@/lib/blocked-username-terms';
import { countryCodeToName, countryToFlagEmoji, COUNTRY_OPTIONS } from '@/lib/country';

const BIO_MAX_LENGTH = 500;

type ProfileRow = {
  username?: string;
  display_name?: string;
  country?: string;
  created_at?: string;
  xp?: number;
  avatar_url?: string | null;
  bio?: string | null;
  total_quizzes_taken?: number;
  total_questions_correct?: number;
  total_questions_incorrect?: number;
};

export default function ProfileTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [standing, setStanding] = useState<{ division: number; points: number; wins: number; draws: number; losses: number } | null>(null);
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [editingCountry, setEditingCountry] = useState(false);
  const [countrySaving, setCountrySaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCacheBuster, setAvatarCacheBuster] = useState(0);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function pickAndUploadAvatar() {
    if (!userId || avatarUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64;
    if (!base64) {
      Alert.alert('Upload failed', 'Could not read the image. Try another photo.');
      return;
    }
    setAvatarUploading(true);
    try {
      const contentType = asset.uri?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const ext = contentType === 'image/png' ? 'png' : 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const arrayBuffer = base64ToArrayBuffer(base64);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
        upsert: true,
        contentType,
      });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', userId);
      if (updateError) throw updateError;
      setProfile((p) => (p ? { ...p, avatar_url: publicUrl } : null));
      setAvatarCacheBuster((v) => v + 1);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not update profile picture.');
    } finally {
      setAvatarUploading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.dismissAll();
        router.replace('/');
        return;
      }
      setUserId(user.id);
      supabase
        .from('profiles')
        .select('username, display_name, country, created_at, xp, avatar_url, bio, total_quizzes_taken, total_questions_correct, total_questions_incorrect')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data ?? null));
      supabase.from('standings').select('division, points, wins, draws, losses').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setStanding(data ?? null));
    });
  }, [router]);

  useEffect(() => {
    const xp = profile?.xp ?? 0;
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('xp', xp)
      .then(({ count }) => {
        setGlobalRank(count != null ? count + 1 : null);
      });
  }, [profile?.xp]);

  async function saveUsername() {
    const trimmed = usernameDraft.trim();
    if (!trimmed || !userId) return;
    if (trimmed === profile?.username) {
      setEditingUsername(false);
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 30) {
      Alert.alert('Invalid username', 'Use 2–30 characters.');
      return;
    }
    if (!isUsernameAllowed(trimmed)) {
      Alert.alert('Username not allowed', 'That username contains a word that isn’t allowed. Please choose another.');
      return;
    }
    setUsernameSaving(true);
    const { error } = await supabase.from('profiles').update({ username: trimmed, updated_at: new Date().toISOString() }).eq('id', userId);
    setUsernameSaving(false);
    if (error) {
      if (error.code === '23505') Alert.alert('Username taken', 'That username is already in use. Try another.');
      else if (error.code === '23514' || error.message?.includes('username_not_allowed')) Alert.alert('Username not allowed', 'That username contains a word that isn’t allowed. Please choose another.');
      else Alert.alert('Error', error.message);
      return;
    }
    setProfile((p) => (p ? { ...p, username: trimmed } : null));
    setEditingUsername(false);
  }

  function startEditUsername() {
    setUsernameDraft(profile?.username ?? '');
    setEditingUsername(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }

  async function saveCountry(code: string) {
    if (!userId) return;
    setCountrySaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ country: code.toUpperCase(), updated_at: new Date().toISOString() })
      .eq('id', userId);
    setCountrySaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile((p) => (p ? { ...p, country: code.toUpperCase() } : null));
    setEditingCountry(false);
  }

  async function saveBio() {
    if (!userId) return;
    const trimmed = bioDraft.trim();
    if (trimmed.length > BIO_MAX_LENGTH) {
      Alert.alert('Too long', `Bio must be ${BIO_MAX_LENGTH} characters or fewer.`);
      return;
    }
    setBioSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ bio: trimmed || null, updated_at: new Date().toISOString() })
      .eq('id', userId);
    setBioSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setProfile((p) => (p ? { ...p, bio: trimmed || null } : null));
    setEditingBio(false);
  }

  function startEditBio() {
    setBioDraft(profile?.bio ?? '');
    setEditingBio(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }

  const name = profile?.display_name || profile?.username || '—';
  const sub = standing
    ? `${standing.wins}W ${standing.draws}D ${standing.losses}L`
    : '@' + (profile?.username ?? '—');

  const joinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const countryDisplay = countryCodeToName(profile?.country) || (profile?.country ?? '—');
  const flagEmoji = profile?.country ? countryToFlagEmoji(profile.country) : null;

  const quizzesTaken = profile?.total_quizzes_taken ?? 0;
  const totalCorrect = profile?.total_questions_correct ?? 0;
  const totalIncorrect = profile?.total_questions_incorrect ?? 0;
  const totalXp = profile?.xp ?? 0;
  const level = levelFromXp(totalXp);

  return (
    <>
    {InputAccessoryView && (
      <InputAccessoryView nativeID="hideKeyboard">
        <View style={[styles.inputAccessory, isDark && styles.inputAccessoryDark]}>
          <Pressable style={styles.inputAccessoryBtn} onPress={() => Keyboard.dismiss()}>
            <Text style={[styles.inputAccessoryText, isDark && styles.inputAccessoryTextDark]}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    )}
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 220 : 80}
    >
    <ScrollView
      ref={scrollRef}
      style={styles.scrollView}
      contentContainerStyle={[
          styles.scrollContent,
          editingBio && styles.scrollContentBioEditing,
          isDark && { paddingTop: 20 + insets.top + 44 },
        ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.avatarSection}>
        <Pressable onPress={pickAndUploadAvatar} disabled={avatarUploading} style={styles.avatarPressable}>
          <View style={[styles.avatarRing, isDark && styles.avatarRingDark]}>
            <Image
              key={`${profile?.avatar_url ?? 'placeholder'}-${avatarCacheBuster}`}
              source={{
                uri: profile?.avatar_url
                  ? `${profile.avatar_url}${profile.avatar_url.includes('?') ? '&' : '?'}v=${avatarCacheBuster}`
                  : PLACEHOLDER_IMAGES.profile,
              }}
              style={styles.avatarImage}
            />
            {avatarUploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </View>
        </Pressable>
        <Text style={[styles.avatarName, isDark && styles.avatarNameDark]} numberOfLines={2}>{name}</Text>
        <Text style={[styles.avatarSub, isDark && styles.avatarSubDark]} numberOfLines={1}>{sub}</Text>
        <Pressable onPress={pickAndUploadAvatar} disabled={avatarUploading} style={styles.changePhotoBtn}>
          <Text style={[styles.changePhotoText, isDark && styles.changePhotoTextDark]}>{avatarUploading ? 'Uploading…' : 'Change photo'}</Text>
        </Pressable>
      </View>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.statTitle, isDark && styles.statTitleDark]}>Your stats</Text>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, styles.statLabelBold, isDark && styles.statLabelDark]}>Global Rank</Text>
          <Text style={[styles.statValue, styles.statValueBold, isDark && styles.statValueDark]}>
            {globalRank != null ? `#${globalRank}` : '—'}
          </Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Level</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{level}</Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Total quizzes taken</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{quizzesTaken}</Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Questions correct</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{totalCorrect}</Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Questions incorrect</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{totalIncorrect}</Text>
        </View>
        <View style={[styles.statRow, isDark && styles.statRowDark]}>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Total XP</Text>
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{totalXp}</Text>
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
          <View style={styles.countryRowRight}>
            <View style={styles.countryWrap}>
              {flagEmoji ? <Text style={styles.flagEmoji}>{flagEmoji}</Text> : <Ionicons name="flag-outline" size={20} color={isDark ? '#a1a1aa' : '#64748b'} />}
              <Text style={[styles.statValue, isDark && styles.statValueDark]}>{countryDisplay}</Text>
            </View>
            <Pressable onPress={() => setEditingCountry(true)} style={styles.countryEditBtn}>
              <Text style={styles.changeUsernameText}>Edit</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal visible={editingCountry} transparent animationType="slide">
        <Pressable style={styles.countryModalBackdrop} onPress={() => !countrySaving && setEditingCountry(false)}>
          <Pressable style={[styles.countryModalContent, isDark && styles.countryModalContentDark]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.countryModalTitle, isDark && styles.countryModalTitleDark]}>Select country</Text>
            <FlatList
              data={COUNTRY_OPTIONS}
              keyExtractor={(item) => item.code}
              style={styles.countryList}
              renderItem={({ item }) => {
                const flag = countryToFlagEmoji(item.code);
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.countryOption,
                      isDark && styles.countryOptionDark,
                      pressed && (isDark ? styles.countryOptionDarkPressed : styles.countryOptionPressed),
                    ]}
                    onPress={() => saveCountry(item.code)}
                    disabled={countrySaving}
                  >
                    {flag ? <Text style={styles.countryOptionFlag}>{flag}</Text> : null}
                    <Text style={[styles.countryOptionName, isDark && styles.countryOptionNameDark]}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />
            <Pressable style={[styles.countryModalCancel, isDark && styles.countryModalCancelDark]} onPress={() => setEditingCountry(false)}>
              <Text style={[styles.countryModalCancelText, isDark && styles.countryModalCancelTextDark]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.statTitle, isDark && styles.statTitleDark]}>Bio</Text>
        {editingBio ? (
          <View style={styles.bioEditRow}>
            <TextInput
              style={[styles.bioInput, isDark && styles.bioInputDark]}
              value={bioDraft}
              onChangeText={setBioDraft}
              placeholder="Write a short paragraph about yourself..."
              placeholderTextColor={isDark ? '#71717a' : '#94a3b8'}
              multiline
              numberOfLines={4}
              maxLength={BIO_MAX_LENGTH + 1}
              editable={!bioSaving}
            />
            <Text style={[styles.bioCharCount, isDark && styles.bioCharCountDark]}>{bioDraft.length}/{BIO_MAX_LENGTH}</Text>
            <View style={styles.bioEditActions}>
              <Pressable style={[styles.usernameBtn, styles.usernameCancel]} onPress={() => setEditingBio(false)} disabled={bioSaving}>
                <Text style={styles.usernameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.usernameBtn, styles.usernameSave]} onPress={saveBio} disabled={bioSaving}>
                <Text style={styles.usernameSaveText}>{bioSaving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.statRow, isDark && styles.statRowDark, styles.bioRow]}>
            <Text style={[styles.bioText, isDark && styles.bioTextDark]} numberOfLines={6}>
              {profile?.bio ? profile.bio : 'No bio yet.'}
            </Text>
            <Pressable onPress={startEditBio}>
              <Text style={styles.changeUsernameText}>{profile?.bio ? 'Edit' : 'Add bio'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.statTitle, isDark && styles.statTitleDark]}>Username</Text>
        {editingUsername ? (
          <View style={styles.usernameEditRow}>
            <TextInput
              style={[styles.usernameInput, isDark && styles.usernameInputDark]}
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              placeholder="Username"
              placeholderTextColor={isDark ? '#71717a' : '#94a3b8'}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!usernameSaving}
              inputAccessoryViewID={Platform.OS === 'ios' ? 'hideKeyboard' : undefined}
            />
            <Pressable style={styles.hideKeyboardBtn} onPress={() => Keyboard.dismiss()}>
              <Ionicons name="chevron-down" size={20} color={isDark ? '#a1a1aa' : '#64748b'} />
              <Text style={[styles.hideKeyboardText, isDark && styles.hideKeyboardTextDark]}>Hide keyboard</Text>
            </Pressable>
            <View style={styles.usernameEditActions}>
              <Pressable style={[styles.usernameBtn, styles.usernameCancel]} onPress={() => setEditingUsername(false)} disabled={usernameSaving}>
                <Text style={styles.usernameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.usernameBtn, styles.usernameSave]} onPress={saveUsername} disabled={usernameSaving}>
                <Text style={styles.usernameSaveText}>{usernameSaving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.statRow, isDark && styles.statRowDark]}>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>@{profile?.username ?? '—'}</Text>
            <Pressable onPress={startEditUsername}>
              <Text style={styles.changeUsernameText}>Change</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Link href="/profile/friends" asChild>
        <Pressable style={[styles.card, isDark && styles.cardDark, styles.friendsCard]}>
          <View style={styles.friendsRow}>
            <Ionicons name="people" size={24} color={isDark ? '#a78bfa' : '#7c3aed'} />
            <Text style={[styles.friendsTitle, isDark && styles.friendsTitleDark]}>Friends</Text>
            <Ionicons name="chevron-forward" size={20} color={isDark ? '#71717a' : '#94a3b8'} />
          </View>
          <Text style={[styles.friendsSub, isDark && styles.friendsSubDark]}>View friends, requests, and add by username</Text>
        </Pressable>
      </Link>

    </ScrollView>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  containerDark: { backgroundColor: '#0e0e10' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  scrollContentBioEditing: { paddingBottom: 340 },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarPressable: { marginBottom: 8 },
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
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarName: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  avatarNameDark: { color: '#fafafa' },
  avatarSub: { fontSize: 14, color: '#64748b', marginTop: 4, textAlign: 'center' },
  avatarSubDark: { color: '#a1a1aa' },
  changePhotoBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 16 },
  changePhotoText: { fontSize: 15, fontWeight: '600', color: '#7c3aed' },
  changePhotoTextDark: { color: '#a78bfa' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardDark: { backgroundColor: '#18181b', borderColor: '#26262c' },
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
  statLabelBold: { fontWeight: '700' },
  statValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  statValueDark: { color: '#e4e4e7' },
  statValueBold: { fontWeight: '800', fontSize: 15 },
  countryRowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countryWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countryEditBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  flagEmoji: { fontSize: 20 },
  countryModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 0 },
  countryModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 24 },
  countryModalContentDark: { backgroundColor: '#18181b' },
  countryModalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', padding: 20, paddingBottom: 12 },
  countryModalTitleDark: { color: '#fafafa' },
  countryList: { maxHeight: 360 },
  countryOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  countryOptionDark: { borderBottomColor: '#27272a' },
  countryOptionPressed: { backgroundColor: 'rgba(0,0,0,0.05)' },
  countryOptionDarkPressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  countryOptionFlag: { fontSize: 22 },
  countryOptionName: { fontSize: 16, color: '#111827', fontWeight: '500' },
  countryOptionNameDark: { color: '#e4e4e7' },
  countryModalCancel: { marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  countryModalCancelDark: { backgroundColor: '#27272a' },
  countryModalCancelText: { fontSize: 16, fontWeight: '600', color: '#475569' },
  countryModalCancelTextDark: { color: '#a1a1aa' },
  bioEditRow: { gap: 10 },
  bioInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  bioInputDark: { borderColor: '#3f3f46', backgroundColor: '#27272a', color: '#e4e4e7' },
  bioCharCount: { fontSize: 12, color: '#94a3b8', alignSelf: 'flex-end' },
  bioCharCountDark: { color: '#71717a' },
  bioEditActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  bioRow: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  bioText: { fontSize: 15, color: '#475569', lineHeight: 22 },
  bioTextDark: { color: '#a1a1aa' },
  usernameEditRow: { gap: 12 },
  usernameInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  usernameInputDark: { borderColor: '#3f3f46', backgroundColor: '#27272a', color: '#e4e4e7' },
  hideKeyboardBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  hideKeyboardText: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  hideKeyboardTextDark: { color: '#a1a1aa' },
  inputAccessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  inputAccessoryDark: { backgroundColor: '#18181b', borderTopColor: '#27272a' },
  inputAccessoryBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  inputAccessoryText: { fontSize: 16, fontWeight: '600', color: '#4f46e5' },
  inputAccessoryTextDark: { color: '#818cf8' },
  usernameEditActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  usernameBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  usernameCancel: { backgroundColor: '#f1f5f9' },
  usernameCancelText: { color: '#475569', fontWeight: '600' },
  usernameSave: { backgroundColor: '#4f46e5' },
  usernameSaveText: { color: '#fff', fontWeight: '600' },
  changeUsernameText: { color: '#4f46e5', fontWeight: '600', fontSize: 14 },
  friendsCard: { marginBottom: 12 },
  friendsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  friendsTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  friendsTitleDark: { color: '#fafafa' },
  friendsSub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  friendsSubDark: { color: '#a1a1aa' },
});
