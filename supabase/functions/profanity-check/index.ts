import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const BLOCKLIST = [
  'bad', 'curse', 'offensive', 'slur', 'abuse', 'hate', 'spam',
  'admin', 'moderator', 'support', 'trivora',
];
const MIN_LENGTH = 3;
const MAX_USERNAME = 24;
const MAX_TEAM_NAME = 32;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1|!/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4|@/g, 'a')
    .replace(/5|\$/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/[^a-z]/g, '');
}

function containsBlocked(text: string): boolean {
  const n = normalize(text);
  for (const word of BLOCKLIST) {
    if (n.includes(word) || word.length >= 3 && n.includes(normalize(word))) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const type = body.type ?? 'username';
    const value = (body.value ?? body.text ?? '').trim();

    if (!value) {
      return new Response(
        JSON.stringify({ allowed: false, reason: 'empty' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (type === 'username') {
      if (value.length < MIN_LENGTH || value.length > MAX_USERNAME) {
        return new Response(
          JSON.stringify({ allowed: false, reason: 'length', min: MIN_LENGTH, max: MAX_USERNAME }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        return new Response(
          JSON.stringify({ allowed: false, reason: 'invalid_chars' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (type === 'team_name' || type === 'display_name') {
      if (value.length < 2 || (type === 'team_name' && value.length > MAX_TEAM_NAME)) {
        return new Response(
          JSON.stringify({ allowed: false, reason: 'length', max: MAX_TEAM_NAME }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const blocked = containsBlocked(value);
    return new Response(
      JSON.stringify({
        allowed: !blocked,
        reason: blocked ? 'offensive' : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
