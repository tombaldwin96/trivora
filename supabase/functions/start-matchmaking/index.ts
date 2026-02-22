import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Quick match: one DB round trip via quick_match_enter RPC.
 * Pairs two waiting users immediately; scales to 2000+ concurrent (FOR UPDATE SKIP LOCKED).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
    const { data: rows, error } = await admin.rpc('quick_match_enter', { p_user_id: user.id });

    if (error) {
      const status = error.message?.includes('No active season') ? 400 : 500;
      return new Response(JSON.stringify({ error: error.message ?? 'Matchmaking failed' }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const row = Array.isArray(rows) && rows.length > 0
      ? (rows[0] as { match_id: string; player_a: string; player_b: string | null; started_at: string | null })
      : null;

    if (!row?.match_id) {
      return new Response(JSON.stringify({ error: 'Matchmaking failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const message = row.player_b
      ? 'Match found'
      : 'Playing your round; we\'ll find an opponent.';

    return new Response(
      JSON.stringify({
        match_id: row.match_id,
        player_a: row.player_a,
        player_b: row.player_b ?? undefined,
        started_at: row.started_at ?? undefined,
        message,
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
