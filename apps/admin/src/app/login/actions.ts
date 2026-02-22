'use server';

import { redirect } from 'next/navigation';
import { createAdminSupabase } from '@/lib/supabase';

const ADMIN_USERNAME = 'tom';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'tom@admin.trivora.local';

export async function loginAction(formData: FormData) {
  const username = (formData.get('username') as string)?.trim() ?? '';
  const password = (formData.get('password') as string) ?? '';

  if (!username || !password) {
    return { error: 'Username and password are required' };
  }

  const supabase = await createAdminSupabase();
  const isEmail = username.includes('@');
  const signInEmail = isEmail ? username : (username === ADMIN_USERNAME ? ADMIN_EMAIL : null);

  if (!signInEmail) {
    return { error: 'Invalid username or password' };
  }

  const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({
    email: signInEmail,
    password,
  });

  if (signInError) {
    return { error: signInError.message };
  }
  if (!user) {
    return { error: 'Sign in failed' };
  }

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) {
    await supabase.auth.signOut();
    return { error: 'Not an admin' };
  }

  redirect('/');
}
