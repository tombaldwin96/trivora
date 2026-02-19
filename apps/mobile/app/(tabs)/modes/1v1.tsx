import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export default function OneVOneScreen() {
  const router = useRouter();
  const [quickMatchLoading, setQuickMatchLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('ensure_user_standing').then(() => {});
  }, []);

  async function quickMatch() {
    setQuickMatchLoading(true);
    await supabase.rpc('ensure_user_standing');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/start-matchmaking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    setQuickMatchLoading(false);
    if (!res.ok) {
      Alert.alert('Error', data.error || 'Matchmaking failed');
      return;
    }
    if (data.match_id) {
      router.replace(`/match/${data.match_id}`);
    } else if (data.queued) {
      Alert.alert('No opponent yet', data.message || 'Try again in a moment or invite a friend.');
    }
  }

  return (
    <View style={styles.container}>
      <Pressable style={[styles.button, styles.quickMatchButton, quickMatchLoading && styles.disabled]} onPress={quickMatch} disabled={quickMatchLoading}>
        {quickMatchLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Quick match</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8fafc' },
  quickMatchButton: { backgroundColor: '#16a34a', marginBottom: 8 },
  button: { backgroundColor: '#4f46e5', padding: 16, borderRadius: 12, marginBottom: 12 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.6 },
});
