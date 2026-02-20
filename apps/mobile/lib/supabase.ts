/**
 * Lazy Supabase client: no createClient() or AsyncStorage until first use.
 * Prevents native bridge/AsyncStorage from running at bundle load (iOS boot crash workaround).
 */
import { createClient } from '@trivora/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let instance: ReturnType<typeof createClient> | null = null;

function getClient(): ReturnType<typeof createClient> {
  if (instance == null) {
    instance = createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return instance;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop: string) {
    return (getClient() as Record<string, unknown>)[prop];
  },
});
