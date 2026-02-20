import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

const RESEND_COOLDOWN_SEC = 60;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const emailRaw = Array.isArray(params.email) ? params.email[0] : params.email;
  const email = (emailRaw ?? '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  if (!email) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Missing email. Go back and enter your email.</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  async function verify() {
    const trimmed = code.split('').filter((c) => c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r').join('');
    if (trimmed.length < 4) {
      Alert.alert('Enter the code', 'Check your email for the 6-digit code we sent.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: trimmed,
      type: 'email',
    });
    setLoading(false);
    if (error) {
      Alert.alert('Invalid code', error.message);
      return;
    }
    router.replace('/(tabs)');
  }

  async function resendCode() {
    if (resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setResendLoading(false);
    if (error) {
      Alert.alert('Resend failed', error.message);
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SEC);
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>We sent a 6-digit code to {email}</Text>
          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor="#94a3b8"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            autoFocus
          />
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={verify}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Verifying…' : 'Sign in'}</Text>
          </Pressable>
          <Pressable
            style={[styles.resendButton, (resendLoading || resendCooldown > 0 || loading) && styles.buttonDisabled]}
            onPress={resendCode}
            disabled={resendLoading || resendCooldown > 0 || loading}
          >
            <Text style={styles.resendButtonText}>
              {resendLoading ? 'Sending…' : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </Text>
          </Pressable>
          <Pressable style={styles.link} onPress={() => router.back()} disabled={loading}>
            <Text style={styles.linkText}>Use a different email</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  container: { backgroundColor: '#f8fafc' },
  error: { color: '#dc2626', textAlign: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#334155', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  button: { backgroundColor: '#4f46e5', padding: 16, borderRadius: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center', fontSize: 16 },
  resendButton: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 16 },
  resendButtonText: { color: '#64748b', fontWeight: '600', textAlign: 'center', fontSize: 14 },
  link: { marginTop: 16 },
  linkText: { color: '#4f46e5', textAlign: 'center', fontSize: 14 },
});
