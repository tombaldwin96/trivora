import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
    const inviteId = body.invite_id;
    if (!inviteId) {
      return new Response(JSON.stringify({ error: 'Missing invite_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('id, to_user, from_user, match_id')
      .eq('id', inviteId)
      .eq('from_user', user.id)
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', invite.from_user)
      .single();
    const inviterUsername = (inviterProfile?.username as string) ?? 'Someone';

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Server config error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey
    );

    const { data: tokens } = await serviceClient
      .from('push_tokens')
      .select('token')
      .eq('user_id', invite.to_user);

    if (!tokens?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const title = 'Trivora';
    const messageBody = `${inviterUsername} invited you to a 1v1 match`;
    const payload = tokens.map((r) => ({
      to: r.token,
      title,
      body: messageBody,
      sound: 'default' as const,
      data: { type: 'invite', matchId: invite.match_id, inviteId: invite.id },
    }));

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      console.error('Expo push error', pushRes.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to send push' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent: payload.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-invite-push', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
