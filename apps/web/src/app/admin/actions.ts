'use server';

// Set ADMIN_USERNAME and ADMIN_PASSWORD in .env.local (e.g. ADMIN_USERNAME=admin ADMIN_PASSWORD=your-secret)
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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

export async function loginAction(formData: FormData) {
  const username = (formData.get('username') as string)?.trim() ?? '';
  const password = (formData.get('password') as string) ?? '';

  const expectedUsername = process.env.ADMIN_USERNAME ?? 'tom';
  const expectedPassword = process.env.ADMIN_PASSWORD ?? 'baldwin';

  if (!expectedPassword) {
    return { error: 'Admin login not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env.local' };
  }

  if (!username || !password) {
    return { error: 'Username and password are required' };
  }

  const userOk = username === expectedUsername;
  const passHash = sign(password);
  const expectedHash = sign(expectedPassword);
  const passOk = passHash.length === expectedHash.length && timingSafeEqual(Buffer.from(passHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));

  if (!userOk || !passOk) {
    return { error: 'Invalid username or password' };
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

  redirect('/admin');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect('/admin');
}

export async function getAdminSession(): Promise<{ loggedIn: boolean; username?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { loggedIn: false };

  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { loggedIn: false };

  const expectedSig = sign(payload);
  if (payload.length !== expectedSig.length || !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return { loggedIn: false };
  }

  const [username, expiryStr] = payload.split(':');
  const expiry = Number(expiryStr);
  if (!username || !Number.isFinite(expiry) || Date.now() > expiry) {
    return { loggedIn: false };
  }

  return { loggedIn: true, username };
}
