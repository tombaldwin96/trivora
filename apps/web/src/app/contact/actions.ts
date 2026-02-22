'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function submitIdea(formData: FormData): Promise<{ error?: string }> {
  const first_name = (formData.get('first_name') as string)?.trim() ?? '';
  const last_name = (formData.get('last_name') as string)?.trim() ?? '';
  const email = (formData.get('email') as string)?.trim() ?? '';
  const description = (formData.get('description') as string)?.trim() ?? '';

  if (!first_name || !last_name || !email || !description) {
    return { error: 'All fields are required.' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await (supabase as any).from('idea_submissions').insert({
    first_name,
    last_name,
    email,
    description,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
