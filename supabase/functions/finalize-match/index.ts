import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const POINTS_WIN = 3;
const POINTS_DRAW = 1;
const POINTS_LOSS = -2;
const PROMOTION_THRESHOLD = 12;
const RELEGATION_THRESHOLD = 5;
const GAMES_PER_SEASON = 6;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
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

    const body = await req.json().catch(() => ({}));
    const matchId = body.match_id ?? body.id;
    if (!matchId) {
      return new Response(JSON.stringify({ error: 'Missing match_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: match, error: matchErr } = await supabase
      .from('matches_1v1')
      .select('*')
      .eq('id', matchId)
      .single();

    if (matchErr || !match || match.status !== 'in_progress') {
      return new Response(JSON.stringify({ error: 'Match not found or not in progress' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scoreA = match.points_a ?? 0;
    const scoreB = match.points_b ?? 0;
    let pointsA = 0;
    let pointsB = 0;
    let winnerId: string | null = null;
    if (scoreA > scoreB) {
      pointsA = POINTS_WIN;
      pointsB = POINTS_LOSS;
      winnerId = match.player_a;
    } else if (scoreB > scoreA) {
      pointsB = POINTS_WIN;
      pointsA = POINTS_LOSS;
      winnerId = match.player_b;
    } else {
      pointsA = POINTS_DRAW;
      pointsB = POINTS_DRAW;
    }

    const result = { winner_id: winnerId, score_a: scoreA, score_b: scoreB, points_a: pointsA, points_b: pointsB };

    await supabase
      .from('matches_1v1')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        result,
        points_a: pointsA,
        points_b: pointsB,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    const seasonId = match.season_id;
    const division = match.division;

    for (const [player, pts, isWin, isDraw, isLoss] of [
      [match.player_a, pointsA, pointsA === POINTS_WIN, pointsA === POINTS_DRAW, pointsA === POINTS_LOSS],
      [match.player_b, pointsB, pointsB === POINTS_WIN, pointsB === POINTS_DRAW, pointsB === POINTS_LOSS],
    ] as [string, number, boolean, boolean, boolean][]) {
      const { data: standing } = await supabase
        .from('standings')
        .select('*')
        .eq('user_id', player)
        .eq('season_id', seasonId)
        .single();

      const gamesPlayed = (standing?.games_played ?? 0) + 1;
      const wins = (standing?.wins ?? 0) + (isWin ? 1 : 0);
      const draws = (standing?.draws ?? 0) + (isDraw ? 1 : 0);
      const losses = (standing?.losses ?? 0) + (isLoss ? 1 : 0);
      const points = (standing?.points ?? 0) + pts;

      const promoted = division > 1 && points >= PROMOTION_THRESHOLD;
      const relegated = division < 5 && gamesPlayed >= GAMES_PER_SEASON && points < RELEGATION_THRESHOLD;

      await supabase.from('standings').upsert(
        {
          user_id: player,
          season_id: seasonId,
          division,
          points,
          games_played: gamesPlayed,
          wins,
          draws,
          losses,
          promoted,
          relegated,
          mmr: standing?.mmr ?? 1000,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,season_id' }
      );
    }

    return new Response(
      JSON.stringify({
        match_id: matchId,
        result,
        standings_updated: true,
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
