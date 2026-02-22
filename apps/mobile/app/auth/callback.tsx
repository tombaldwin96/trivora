import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

function parseOAuthRedirectUrl(url: string): { access_token?: string; refresh_token?: string } {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  return {
    access_token: params.get('access_token') ?? undefined,
    refresh_token: params.get('refresh_token') ?? undefined,
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url || !url.includes('access_token')) {
          setStatus('error');
          return;
        }
        const { access_token, refresh_token } = parseOAuthRedirectUrl(url);
        if (!access_token || !refresh_token) {
          setStatus('error');
          return;
        }
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          setStatus('error');
          return;
        }
        setStatus('done');
        router.replace('/(tabs)');
      } catch {
        setStatus('error');
      }
    })();
  }, [router]);

  return (
    <View style={styles.container}>
      {status === 'loading' && <ActivityIndicator size="large" color="#4f46e5" />}
      {status === 'done' && <Text style={styles.text}>Signed in. Redirecting…</Text>}
      {status === 'error' && (
        <Text style={styles.error}>Could not complete sign in. Try again from the home screen.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' },
  text: { color: '#334155', marginTop: 12 },
  error: { color: '#dc2626', textAlign: 'center' },
});
