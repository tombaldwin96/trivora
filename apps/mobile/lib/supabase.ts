import { createClient } from '@mahan/supabase';
import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const storage = {
  getItem: async (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => { await SecureStore.setItemAsync(key, value); },
  removeItem: async (key: string) => { await SecureStore.deleteItemAsync(key); },
};

export const supabase = createClient(url, anon, {
  auth: {
    storage,
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});
