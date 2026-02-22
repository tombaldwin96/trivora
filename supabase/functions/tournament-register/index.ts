import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Tournament registration (server-side).
 * For free tournaments, creates registration with payment_status = 'paid'.
 * For paid tournaments, use create-tournament-checkout instead; payment_status is set to 'paid' by stripe-tournament-webhook on checkout.session.completed.
 */
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tournamentId = body.tournament_id ?? body.tournamentId;
    if (!tournamentId) {
      return new Response(JSON.stringify({ error: 'tournament_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, entry_fee_pence')
      .eq('id', tournamentId)
      .single();

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const entryFeePence = (tournament as { entry_fee_pence?: number }).entry_fee_pence ?? 0;
    const paymentStatus = entryFeePence === 0 ? 'paid' : 'unpaid';
    const paymentProvider = entryFeePence === 0 ? 'none' : null;

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error } = await serviceSupabase.from('tournament_registrations').upsert(
      {
        tournament_id: tournamentId,
        user_id: user.id,
        payment_status: paymentStatus,
        payment_provider: paymentProvider,
      },
      { onConflict: 'tournament_id,user_id' }
    );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, payment_status: paymentStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
