import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MMR_TOLERANCE = 150;
const MAX_QUEUE_WAIT_MS = 60000;

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

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    const { data: myStanding } = await admin
      .from('standings')
      .select('mmr, division, season_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const mmr = myStanding?.mmr ?? 1000;
    const seasonId = myStanding?.season_id;
    const division = myStanding?.division ?? 5;

    if (!seasonId) {
      return new Response(JSON.stringify({ error: 'No active season; complete onboarding first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: opponents } = await admin
      .from('standings')
      .select('user_id, mmr')
      .eq('season_id', seasonId)
      .eq('division', division)
      .gte('mmr', mmr - MMR_TOLERANCE)
      .lte('mmr', mmr + MMR_TOLERANCE)
      .neq('user_id', user.id)
      .limit(20);

    const existingMatch = await admin
      .from('matches_1v1')
      .select('id, player_a, player_b')
      .or(`player_a.eq.${user.id},player_b.eq.${user.id}`)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (existingMatch?.id) {
      return new Response(
        JSON.stringify({
          match_id: existingMatch.id,
          status: 'pending',
          message: 'Existing pending match found',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const opponentIds = (opponents ?? []).map((o) => o.user_id);
    const { data: pendingInvite } = opponentIds.length
      ? await admin
          .from('invites')
          .select('from_user')
          .eq('to_user', user.id)
          .eq('status', 'pending')
          .in('from_user', opponentIds)
          .limit(1)
          .maybeSingle()
      : { data: null };

    const opponentId = pendingInvite?.from_user ?? opponentIds[0] ?? null;
    if (!opponentId) {
      return new Response(
        JSON.stringify({
          queued: true,
          message: 'No opponent in range; try inviting a friend or wait for matchmaking',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const playerA = user.id < opponentId ? user.id : opponentId;
    const playerB = user.id < opponentId ? opponentId : user.id;

    const { data: match, error } = await admin
      .from('matches_1v1')
      .insert({
        season_id: seasonId,
        division,
        status: 'pending',
        player_a: playerA,
        player_b: playerB,
        points_a: 0,
        points_b: 0,
      })
      .select('id, player_a, player_b, started_at')
      .single();

    if (error || !match) {
      return new Response(JSON.stringify({ error: error?.message ?? 'Failed to create match' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        match_id: match.id,
        player_a: match.player_a,
        player_b: match.player_b,
        started_at: match.started_at,
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
