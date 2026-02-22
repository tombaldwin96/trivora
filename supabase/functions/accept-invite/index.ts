import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const INVITE_EXPIRY_HOURS = 72;

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
    const code = body.code ?? body.deep_link_code;
    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('deep_link_code', code)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: 'Invite not found or already used' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (invite.from_user === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot accept your own invite' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const createdAt = new Date(invite.created_at);
    const expiry = new Date(createdAt.getTime() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
    if (new Date() > expiry) {
      await supabase.from('invites').update({ status: 'expired' }).eq('id', invite.id);
      return new Response(JSON.stringify({ error: 'Invite expired' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mode = invite.mode ?? '1v1';
    let matchId: string | null = invite.match_id ?? null;

    // If invite already has a session (match_id), join that match instead of creating one.
    if (mode === '1v1' && invite.match_id) {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceKey ?? '',
      );
      const { error: updateErr } = await admin
        .from('matches_1v1')
        .update({ player_b: user.id, updated_at: new Date().toISOString() })
        .eq('id', invite.match_id)
        .is('player_b', null)
        .eq('status', 'pending');
      if (updateErr) {
        return new Response(JSON.stringify({ error: 'Match no longer available' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      matchId = invite.match_id;
    } else if (mode === '1v1' && !invite.match_id) {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceKey ?? '',
      );

      const now = new Date().toISOString();
      let { data: currentSeason } = await admin
        .from('seasons')
        .select('id, division')
        .eq('mode', '1v1')
        .eq('division', 5)
        .lte('starts_at', now)
        .gte('ends_at', now)
        .limit(1)
        .maybeSingle();

      if (!currentSeason) {
        const { data: anySeason } = await admin.from('seasons').select('id, division').eq('mode', '1v1').eq('division', 5).limit(1).maybeSingle();
        currentSeason = anySeason ?? null;
      }
      if (!currentSeason) {
        return new Response(JSON.stringify({ error: 'No active season' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const playerA = invite.from_user;
      const playerB = user.id;
      const { data: match, error: matchErr } = await admin
        .from('matches_1v1')
        .insert({
          season_id: currentSeason.id,
          division: currentSeason.division,
          status: 'pending',
          player_a: playerA,
          player_b: playerB,
          points_a: 0,
          points_b: 0,
        })
        .select('id')
        .single();

      if (matchErr || !match) {
        return new Response(JSON.stringify({ error: 'Failed to create match' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      matchId = match.id;
    }

    const { error: updateErr } = await supabase
      .from('invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        to_user: user.id,
        match_id: matchId,
      })
      .eq('id', invite.id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        invite_id: invite.id,
        match_id: matchId,
        mode,
        message: 'Invite accepted',
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
