import { createServerClient } from '@supabase/ssr';
import type { Database } from '@trivora/supabase';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient<Database>(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value ?? '';
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value, ...(options as Record<string, string>) });
        } catch (_) {}
      },
      remove(name: string) {
        try {
          cookieStore.set({ name, value: '', maxAge: 0 });
        } catch (_) {}
      },
    },
  });
}
