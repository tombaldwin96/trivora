import { createClient } from '@supabase/supabase-js';
import type { Database } from '@trivora/supabase';

/**
 * Server-only Supabase client with service role for admin operations.
 * Only use after verifying admin session (e.g. getAdminSession()).
 * Returns null if env vars are missing (e.g. local dev without .env).
 */
export function createAdminSupabaseServer(): ReturnType<typeof createClient<Database>> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
}
