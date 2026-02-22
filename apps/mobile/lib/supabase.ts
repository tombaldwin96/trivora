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
    if (!url?.trim()) {
      throw new Error(
        'Supabase URL not set. For local dev add EXPO_PUBLIC_SUPABASE_URL to apps/mobile/.env. ' +
          'For TestFlight/EAS builds add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in EAS Dashboard → Project → Environment variables, then rebuild.'
      );
    }
    if (!anon?.trim()) {
      throw new Error(
        'Supabase anon key not set. For TestFlight/EAS add EXPO_PUBLIC_SUPABASE_ANON_KEY in EAS Dashboard → Project → Environment variables, then rebuild.'
      );
    }
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
