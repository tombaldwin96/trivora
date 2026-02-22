import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Server-authoritative tournament match result.
 * - Call with service_role or ensure caller is admin (e.g. backend job or admin UI).
 * - Idempotency: same idempotency_key is a no-op after first success.
 * TODO: Store idempotency keys in a table to enforce once-only.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const matchId = body.match_id ?? body.matchId;
    const winnerUserId = body.winner_user_id ?? body.winnerUserId ?? null;
    const playerAScore = body.player_a_score ?? body.playerAScore ?? 0;
    const playerBScore = body.player_b_score ?? body.playerBScore ?? 0;
    const idempotencyKey = body.idempotency_key ?? body.idempotencyKey;

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: 'match_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: match, error: fetchErr } = await supabase
      .from('tournament_matches')
      .select('id, status, tournament_id, round_number')
      .eq('id', matchId)
      .single();

    if (fetchErr || !match) {
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((match as { status: string }).status === 'completed') {
      return new Response(
        JSON.stringify({ ok: true, already_completed: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: updateErr } = await supabase
      .from('tournament_matches')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        winner_user_id: winnerUserId,
        player_a_score: playerAScore,
        player_b_score: playerBScore,
      })
      .eq('id', matchId);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: updateErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TODO: Create next-round match(es) in bracket; update tournament_rounds; check for Top 16 qualification.
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
