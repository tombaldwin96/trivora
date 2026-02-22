import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@trivora/supabase';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function POST(request: Request) {
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

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
    const target = body.target === 'ios' || body.target === 'android' ? body.target : 'all';
    const data = body.data && typeof body.data === 'object' ? body.data : undefined;
    const testMode = body.test === true;

    if (!title && !messageBody) {
      return NextResponse.json({ error: 'Title or body is required' }, { status: 400 });
    }

    const serviceClient = createClient<Database>(url, serviceKey);

    let query = serviceClient.from('push_tokens').select('token, platform');
    if (target !== 'all') {
      query = query.eq('platform', target);
    }
    const { data: tokens, error: tokensError } = await query;

    if (tokensError) {
      return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
    }

    let rows = (tokens ?? []) as { token: string; platform: string }[];
    if (testMode && rows.length > 0) {
      rows = [rows[0]];
    }
    if (rows.length === 0) {
      await (serviceClient as any).from('push_notification_log').insert({
        created_by: user.id,
        title: title || '(no title)',
        body: messageBody || null,
        target,
        recipient_count: 0,
        meta_json: { note: 'No tokens to send' },
      });
      return NextResponse.json({ ok: true, sent: 0, total: 0, message: 'No devices to send to' });
    }

    const useSound = body.sound !== false;
    const payload = rows.map((r) => ({
      to: r.token,
      title: title || 'Trivora',
      body: messageBody || undefined,
      sound: useSound ? ('default' as const) : null,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    }));

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const pushJson = await pushRes.json().catch(() => ({}));
    const receipts = Array.isArray(pushJson.data) ? pushJson.data : [];
    const sent = receipts.filter((r: { status?: string }) => r.status === 'ok').length;
    const failed = receipts.filter((r: { status?: string }) => r.status !== 'ok').length;

    await (serviceClient as any).from('push_notification_log').insert({
      created_by: user.id,
      title: title || '(no title)',
      body: messageBody || null,
      target,
      recipient_count: sent,
      meta_json: { total_tokens: rows.length, failed, receipts: receipts.length, test: testMode },
    });

    return NextResponse.json({
      ok: true,
      sent,
      failed,
      total: rows.length,
      message: `Sent to ${sent} device${sent !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
    });
  } catch (e) {
    console.error('send-push', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
