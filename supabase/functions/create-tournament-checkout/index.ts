import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Creates a Stripe Checkout Session for tournament entry (£5).
 * Requires STRIPE_SECRET_KEY in Supabase Edge Function secrets.
 * Client calls this with tournament_id; user is taken from JWT.
 * Returns { url } to redirect the user to Stripe Checkout.
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

    const { data: { user } } = await supabase.auth.getUser();
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

    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecret) {
      return new Response(JSON.stringify({ error: 'Payment not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, entry_fee_pence, name, title')
      .eq('id', tournamentId)
      .single();

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const entryFeePence = (tournament as { entry_fee_pence?: number }).entry_fee_pence ?? 0;
    if (entryFeePence <= 0) {
      return new Response(JSON.stringify({ error: 'Tournament has no entry fee' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const origin = req.headers.get('origin') ?? req.headers.get('referer')?.replace(/\/$/, '') ?? 'https://trivora.app';
    const successUrl =
      body.success_url ??
      `${origin}/tournament-paid?tournament_id=${encodeURIComponent(tournamentId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancel_url ?? `${origin}/tournament/${tournamentId}?checkout=cancelled`;

    const sessionPayload = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': String(entryFeePence),
      'line_items[0][price_data][product_data][name]': (tournament as { name?: string; title?: string }).name || (tournament as { title?: string }).title || 'Tournament entry',
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[tournament_id]': tournamentId,
      'metadata[user_id]': user.id,
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionPayload.toString(),
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      console.error('Stripe error:', stripeRes.status, errText);
      return new Response(JSON.stringify({ error: 'Could not create checkout session' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripeRes.json();
    const url = session.url ?? session.id && `https://checkout.stripe.com/c/pay/${session.id}`;

    if (!url) {
      return new Response(JSON.stringify({ error: 'No checkout URL returned' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    await serviceSupabase.from('tournament_registrations').upsert(
      {
        tournament_id: tournamentId,
        user_id: user.id,
        payment_status: 'unpaid',
        payment_provider: 'stripe',
      },
      { onConflict: 'tournament_id,user_id' }
    );

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('create-tournament-checkout:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
