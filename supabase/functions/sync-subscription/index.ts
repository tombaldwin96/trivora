import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey
  );

  try {
    const body = await req.json().catch(() => ({}));
    const provider = body.provider ?? req.headers.get('x-webhook-provider') ?? 'stripe';
    let userId: string | null = null;
    let status = 'free';
    let entitlement: string | null = null;
    let currentPeriodEnd: string | null = null;

    if (provider === 'stripe') {
      const event = body.type ?? body.event?.type;
      const data = body.data?.object ?? body.data ?? body;
      userId = data.metadata?.user_id ?? data.client_reference_id ?? data.subscription ?? data.customer;
      if (data.current_period_end) currentPeriodEnd = new Date(data.current_period_end * 1000).toISOString();
      if (event?.includes('subscription') || data.status) {
        status = data.status === 'active' ? 'active' : data.status === 'trialing' ? 'trialing' : 'canceled';
        entitlement = data.items?.data?.[0]?.price?.id ?? data.plan?.id ?? 'premium';
      }
    } else if (provider === 'revenuecat') {
      const data = body.app_user_id ?? body.subscriber?.original_app_user_id;
      userId = data;
      const ent = body.entitlements ?? body.subscriber?.entitlements;
      const premium = ent?.premium ?? ent?.[Object.keys(ent ?? {})[0]];
      if (premium) {
        status = premium.expires_date && new Date(premium.expires_date) > new Date() ? 'active' : 'canceled';
        entitlement = premium.identifier ?? 'premium';
        currentPeriodEnd = premium.expires_date ?? null;
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ received: true, updated: false, reason: 'no_user_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        status,
        provider,
        entitlement,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ received: true, updated: true }), {
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
