import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'admin_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'admin-fallback-secret';
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', getSecret()).update(value).digest('hex');
}

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const username = (body.get('username') as string)?.trim() ?? '';
    const password = (body.get('password') as string) ?? '';

    const expectedUsername = process.env.ADMIN_USERNAME ?? 'tom';
    const expectedPassword = process.env.ADMIN_PASSWORD ?? 'baldwin';

    if (!expectedPassword) {
      return NextResponse.json(
        { error: 'Admin login not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.' },
        { status: 500 }
      );
    }

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const userOk = username === expectedUsername;
    const passHash = sign(password);
    const expectedHash = sign(expectedPassword);
    const passOk =
      passHash.length === expectedHash.length &&
      timingSafeEqual(Buffer.from(passHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));

    if (!userOk || !passOk) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const expiry = Date.now() + SESSION_DURATION_MS;
    const payload = `${username}:${expiry}`;
    const token = `${payload}.${sign(payload)}`;

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION_MS / 1000,
      path: '/',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Login failed: ${message}` }, { status: 500 });
  }
}
