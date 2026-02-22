/**
 * Auto-detect user country and set profile.country when missing.
 * Prefers device-reported country (harder to spoof with VPN) over IP geolocation.
 * Only updates when profile.country is null or empty. Never overwrites an existing
 * value so the user's choice in profile is always kept.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const VALID_COUNTRY_LENGTH = 2;

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? null;
}

function normalizeCountryCode(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== VALID_COUNTRY_LENGTH || !/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

async function getCountryFromIp(ip: string): Promise<string | null> {
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { countryCode?: string };
    return normalizeCountryCode(data.countryCode);
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

    const body = (await req.json().catch(() => ({}))) as { deviceCountry?: string };
    const deviceCountry = normalizeCountryCode(body.deviceCountry);

    // Never overwrite: only set when profile has no country (keeps user's manual change)
    const { data: profile } = await supabase
      .from('profiles')
      .select('country')
      .eq('id', user.id)
      .single();

    const current = (profile as { country?: string | null } | null)?.country;
    if (current != null && String(current).trim() !== '') {
      return new Response(
        JSON.stringify({ country: String(current).trim().toUpperCase(), skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prefer device-reported country (less likely to be VPN) over IP
    let country: string | null = deviceCountry;
    if (!country) {
      const ip = getClientIp(req);
      if (ip) country = await getCountryFromIp(ip);
    }

    if (!country) {
      return new Response(
        JSON.stringify({ error: 'Could not detect country', country: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error } = await supabase
      .from('profiles')
      .update({ country, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ country }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
