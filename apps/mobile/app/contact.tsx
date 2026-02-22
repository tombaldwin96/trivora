import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';

export default function ContactScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const bg = isDark ? '#18181b' : '#f4f4f5';
  const card = isDark ? '#27272a' : '#fff';
  const text = isDark ? '#fafafa' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';
  const border = isDark ? '#3f3f46' : '#e4e4e7';
  const inputBg = isDark ? '#27272a' : '#fff';

  async function handleSubmit() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();
    const desc = description.trim();
    if (!fn || !ln || !em || !desc) {
      Alert.alert('Missing fields', 'Please fill in first name, last name, email, and description.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('idea_submissions').insert({
      first_name: fn,
      last_name: ln,
      email: em,
      description: desc,
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <Stack.Screen options={{ title: 'Share your idea' }} />
        <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom, backgroundColor: bg }]}>
          <View style={[styles.card, { backgroundColor: card }]}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
            </View>
            <Text style={[styles.successTitle, { color: text }]}>Thanks for submitting!</Text>
            <Text style={[styles.successSub, { color: muted }]}>
              We’ll review your idea and get back to you if needed.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
              onPress={() => router.back()}
            >
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Share your idea' }} />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={[styles.subtitle, { color: muted }]}>
              We’d love to hear from you. Fill out the form below.
            </Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={[styles.label, { color: muted }]}>First name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: text }]}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Jane"
                  placeholderTextColor={muted}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.half}>
                <Text style={[styles.label, { color: muted }]}>Last name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: text }]}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Doe"
                  placeholderTextColor={muted}
                  autoCapitalize="words"
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: muted }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: border, color: text }]}
                value={email}
                onChangeText={setEmail}
                placeholder="jane@example.com"
                placeholderTextColor={muted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: muted }]}>Description of idea</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: inputBg, borderColor: border, color: text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Tell us your idea..."
                placeholderTextColor={muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 16,
    padding: 20,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  field: {
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitBtnPressed: {
    opacity: 0.9,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  backBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backBtnText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
});
