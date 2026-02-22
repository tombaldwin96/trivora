import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@trivora/supabase';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function ensureAdmin() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {},
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!(profile as { is_admin?: boolean } | null)?.is_admin) return { error: 'Forbidden', status: 403 as const };
  return { ok: true as const, user };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await ensureAdmin();
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));

    const serviceClient = createClient<Database>(url, serviceKey);

    const profileUpdate: Record<string, unknown> = {};
    if (typeof body.username === 'string' && body.username.trim()) profileUpdate.username = body.username.trim();
    if (body.display_name !== undefined) profileUpdate.display_name = body.display_name === '' ? null : body.display_name;
    if (typeof body.level === 'number' && body.level >= 1) profileUpdate.level = Math.round(body.level);
    if (typeof body.xp === 'number' && body.xp >= 0) profileUpdate.xp = Math.round(body.xp);
    if (typeof body.is_admin === 'boolean') profileUpdate.is_admin = body.is_admin;
    if (typeof body.is_blocked === 'boolean') profileUpdate.is_blocked = body.is_blocked;
    if (body.country !== undefined) profileUpdate.country = body.country === '' ? null : body.country;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: updateError } = await (serviceClient as any)
        .from('profiles')
        .update({ ...profileUpdate, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message || 'Failed to update profile' }, { status: 400 });
      }
    }

    if (typeof body.email === 'string' && body.email.trim()) {
      const { data: authData, error: authError } = await serviceClient.auth.admin.updateUserById(id, {
        email: body.email.trim(),
      });
      if (authError) {
        return NextResponse.json({ error: authError.message || 'Failed to update email' }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin user update', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await ensureAdmin();
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

    if (id === auth.user?.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const serviceClient = createClient<Database>(url, serviceKey);
    const { error } = await serviceClient.auth.admin.deleteUser(id);
    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to delete user' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin user delete', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
