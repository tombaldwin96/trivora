/**
 * One-time script to create the admin user (username: tom, password: baldwin).
 * Run from apps/admin: pnpm run create-admin-user
 * Loads .env.local; requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'tom@admin.trivora.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'baldwin';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function main() {
  const { data: user, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (createError) {
    if (createError.message.includes('already been registered')) {
      console.log('Admin user already exists, ensuring is_admin...');
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === ADMIN_EMAIL);
      if (!existing) {
        console.error('Could not find existing user');
        process.exit(1);
      }
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', existing.id);
      if (updateError) {
        console.error('Failed to set is_admin:', updateError.message);
        process.exit(1);
      }
      console.log('Admin profile updated. Log in with username: tom, password: baldwin');
      return;
    }
    console.error('Create user failed:', createError.message);
    process.exit(1);
  }

  if (!user?.user?.id) {
    console.error('No user returned');
    process.exit(1);
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_admin: true })
    .eq('id', user.user.id);

  if (updateError) {
    console.error('Failed to set is_admin:', updateError.message);
    process.exit(1);
  }

  console.log('Admin user created. Log in with username: tom, password: baldwin');
}

main();
