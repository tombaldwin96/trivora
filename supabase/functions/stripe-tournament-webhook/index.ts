import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Stripe webhook for tournament entry payments.
 * Configure in Stripe Dashboard: Webhooks → Add endpoint → URL = this function's URL.
 * Event: checkout.session.completed
 * Secrets: STRIPE_WEBHOOK_SECRET (signing secret from Stripe), SUPABASE_SERVICE_ROLE_KEY.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event: { type?: string; data?: { object?: { metadata?: Record<string, string> } } };
  if (webhookSecret && sig) {
    try {
      const Stripe = (await import('https://esm.sh/stripe@14?target=deno')).default;
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (e) {
      console.error('Webhook signature verification failed:', e);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } else {
    try {
      event = JSON.parse(body);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const session = event.data?.object;
  const tournamentId = session?.metadata?.tournament_id;
  const userId = session?.metadata?.user_id;
  if (!tournamentId || !userId) {
    return new Response(JSON.stringify({ received: true, updated: false, reason: 'missing_metadata' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const { error } = await supabase
    .from('tournament_registrations')
    .update({ payment_status: 'paid', payment_provider: 'stripe' })
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId);

  if (error) {
    console.error('tournament_registrations update:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true, updated: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
