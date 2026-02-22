import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Verifies an Apple In-App Purchase (tournament entry) and marks registration paid.
 * Uses Apple App Store Server API "Get Transaction Info".
 *
 * Secrets: APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_P8 (contents of .p8 file),
 * APPLE_BUNDLE_ID (e.g. com.tombaldwin1996.trivora).
 *
 * Body: { tournament_id, user_id, transaction_id, product_id }
 */
function base64UrlEncode(input: string | Uint8Array): string {
  const str = typeof input === 'string' ? input : new TextDecoder().decode(input);
  const bin = typeof input === 'string' ? new TextEncoder().encode(str) : input;
  const base64 = btoa(String.fromCharCode(...bin));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createAppleJWT(): Promise<string> {
  const issuerId = Deno.env.get('APPLE_ISSUER_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const p8 = Deno.env.get('APPLE_PRIVATE_KEY_P8');
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID');
  if (!issuerId || !keyId || !p8 || !bundleId) {
    throw new Error('Apple IAP secrets not configured');
  }

  const header = { alg: 'ES256', kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuerId, iat: now, exp: now + 300, bid: bundleId, aud: 'appstoreconnect-api' };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const keyBytes = pemToBytes(p8);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

async function getTransactionFromApple(transactionId: string, sandbox: boolean): Promise<{ productId?: string } | null> {
  const jwt = await createAppleJWT();
  const baseUrl = sandbox
    ? 'https://api.storekit-sandbox.itunes.apple.com'
    : 'https://api.storekit.itunes.apple.com';
  const url = `${baseUrl}/inApps/v1/transactions/${transactionId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const signedTransactionInfo = data?.signedTransactionInfo;
  if (!signedTransactionInfo || typeof signedTransactionInfo !== 'string') return null;
  const parts = signedTransactionInfo.split('.');
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padding = 4 - (payloadB64.length % 4);
  const padded = padding <= 2 ? payloadB64 + '='.repeat(padding) : payloadB64;
  try {
    const decoded = JSON.parse(atob(padded));
    return { productId: decoded.productId ?? decoded.productID };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tournamentId = body.tournament_id ?? body.tournamentId;
    const transactionId = body.transaction_id ?? body.transactionId;
    const productId = body.product_id ?? body.productId;

    if (!tournamentId || !transactionId || !productId) {
      return new Response(
        JSON.stringify({ error: 'tournament_id, transaction_id, and product_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let tx = await getTransactionFromApple(transactionId, false);
    if (!tx) tx = await getTransactionFromApple(transactionId, true);
    if (!tx || tx.productId !== productId) {
      return new Response(JSON.stringify({ error: 'Invalid or unverified purchase' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error } = await serviceSupabase
      .from('tournament_registrations')
      .update({ payment_status: 'paid', payment_provider: 'apple' })
      .eq('tournament_id', tournamentId)
      .eq('user_id', user.id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, payment_status: 'paid' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (String(e).includes('Apple IAP secrets not configured')) {
      return new Response(JSON.stringify({ error: 'Apple IAP not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('verify-apple-tournament-purchase:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
