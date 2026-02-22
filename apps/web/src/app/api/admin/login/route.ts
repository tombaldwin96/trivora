import { NextResponse } from 'next/server';
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

/** Use public origin (e.g. trivora-cdmg.onrender.com) when behind a proxy like Render. */
function getPublicOrigin(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = request.headers.get('host');
  if (forwardedHost) {
    const proto = forwardedProto === 'https' ? 'https' : forwardedProto === 'http' ? 'http' : 'https';
    return `${proto}://${forwardedHost}`;
  }
  if (host) {
    const proto = forwardedProto === 'https' ? 'https' : forwardedProto === 'http' ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

function redirectToAdmin(request: Request, error?: string): NextResponse {
  const origin = getPublicOrigin(request);
  const adminUrl = new URL('/admin', origin);
  if (error) adminUrl.searchParams.set('error', error);
  return NextResponse.redirect(adminUrl, 302);
}

export async function POST(request: Request) {
  const origin = getPublicOrigin(request);
  const adminUrl = new URL('/admin', origin);

  try {
    const body = await request.formData();
    const username = (body.get('username') as string)?.trim() ?? '';
    const password = (body.get('password') as string) ?? '';

    // Use || so empty env falls back to default
    const expectedUsername = (process.env.ADMIN_USERNAME || 'tom').trim();
    const expectedPassword = process.env.ADMIN_PASSWORD || 'baldwin';

    if (!username || !password) {
      return redirectToAdmin(request, 'Username+and+password+required');
    }

    const userOk = username === expectedUsername;
    const passHash = sign(password);
    const expectedHash = sign(expectedPassword);
    const passOk =
      passHash.length === expectedHash.length &&
      timingSafeEqual(Buffer.from(passHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));

    if (!userOk || !passOk) {
      return redirectToAdmin(request, 'Invalid+username+or+password');
    }

    const expiry = Date.now() + SESSION_DURATION_MS;
    const payload = `${username}:${expiry}`;
    const token = `${payload}.${sign(payload)}`;

    // Set cookie on the redirect response so browser stores it and sends it to /admin
    const res = NextResponse.redirect(adminUrl, 302);
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(SESSION_DURATION_MS / 1000),
      path: '/',
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return redirectToAdmin(request, encodeURIComponent(`Login+failed:+${message}`));
  }
}
