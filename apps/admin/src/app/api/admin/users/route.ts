import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@trivora/supabase';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const PER_PAGE = 50;

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createServerClient<Database>(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!(profile as { is_admin?: boolean } | null)?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const offset = (page - 1) * PER_PAGE;

    const serviceClient = createClient<Database>(url, serviceKey);

    let query = (serviceClient as any)
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PER_PAGE - 1);

    if (q.length > 0) {
      query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
    }

    const { data: profiles, error: profilesError, count } = await query;

    if (profilesError) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const rows = (profiles ?? []) as Record<string, unknown>[];

    const withEmail = await Promise.all(
      rows.map(async (p) => {
        const { data: authUser } = await serviceClient.auth.admin.getUserById(p.id as string);
        return {
          ...p,
          email: authUser?.user?.email ?? null,
        };
      })
    );

    return NextResponse.json({
      users: withEmail,
      total: count ?? 0,
      page,
      perPage: PER_PAGE,
    });
  } catch (e) {
    console.error('admin users list', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
