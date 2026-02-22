import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';
import { corsHeaders } from '../_shared/cors.ts';

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

    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const wsUrl = Deno.env.get('LIVEKIT_WS_URL') ?? 'wss://your-project.livekit.cloud';

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: 'LiveKit not configured (LIVEKIT_API_KEY / LIVEKIT_API_SECRET)' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      room?: string;
      identity?: string;
      name?: string;
      canPublish?: boolean;
    };
    const room = body.room ?? 'trivora-live';
    const identity = body.identity ?? user.id;
    const name = body.name ?? (user.user_metadata?.username as string) ?? user.email ?? 'Viewer';
    const canPublish = body.canPublish === true;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
    });
    at.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    return new Response(
      JSON.stringify({ token, url: wsUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
