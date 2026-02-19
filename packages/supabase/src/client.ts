import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type SupabaseClientTyped = SupabaseClient<Database>;

export interface CreateClientOptions {
  auth?: {
    storage?: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
    detectSessionInUrl?: boolean;
    persistSession?: boolean;
    autoRefreshToken?: boolean;
  };
}

export function createClient(supabaseUrl: string, supabaseAnonKey: string, options?: CreateClientOptions): SupabaseClientTyped {
  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, options ?? {});
}

/** Server-side (Next.js) - pass cookie handlers; for RN/web client use createClient only */
export function createServerClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  _options?: { cookieGetter?: () => string; cookieSetter?: (cookie: string) => void }
): SupabaseClientTyped {
  return createClient(supabaseUrl, supabaseAnonKey);
}
