import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseService } from '../_shared/live_quiz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const anon = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: profile } = await anon.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id ?? body.sessionId;
    const message = body.message ?? 'Thanks for playing!';
    if (!sessionId) return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const supabase = getSupabaseService();
    const now = new Date().toISOString();
    const { error: stateErr } = await supabase.from('live_quiz_state').update({ phase: 'ended', message, updated_at: now }).eq('session_id', sessionId);
    if (stateErr) return new Response(JSON.stringify({ error: stateErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: kickedRows } = await supabase.from('live_quiz_kicked').select('user_id').eq('session_id', sessionId);
    const kickedIds = new Set(((kickedRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
    const { data: scoresRaw } = await supabase.from('live_quiz_scores').select('user_id, total_score, correct_count, answered_count').eq('session_id', sessionId).order('total_score', { ascending: false }).order('last_updated_at', { ascending: true }).limit(50);
    const topScores = (scoresRaw ?? []).filter((r: { user_id: string }) => !kickedIds.has(r.user_id)).slice(0, 25);
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url, country, live_quiz_win_count').in('id', topScores.map((r: { user_id: string }) => r.user_id));
    const profileMap = Object.fromEntries(((profiles ?? []) as { id: string; username: string; avatar_url: string | null; country: string | null; live_quiz_win_count: number }[]).map((p) => [p.id, p]));
    const winnerUserId = topScores[0]?.user_id ?? null;
    if (winnerUserId) {
      await supabase.from('live_quiz_winners').upsert({ session_id: sessionId, user_id: winnerUserId, created_at: now }, { onConflict: 'session_id' });
      await supabase.rpc('increment_live_quiz_win_count', { p_user_id: winnerUserId }).catch(() => null);
    }
    const topJson = topScores.map((r: { user_id: string; total_score: number; correct_count: number; answered_count: number }, i: number) => {
      const prof = profileMap[r.user_id];
      const winCount = (prof?.live_quiz_win_count ?? 0) + (r.user_id === winnerUserId ? 1 : 0);
      return { rank: i + 1, user_id: r.user_id, username: prof?.username ?? null, avatar_url: prof?.avatar_url ?? null, country: prof?.country ?? null, total_score: r.total_score, correct_count: r.correct_count, answered_count: r.answered_count, live_quiz_win_count: winCount };
    });
    await supabase.from('live_quiz_leaderboard_snapshot').upsert({ session_id: sessionId, top_json: topJson, updated_at: now }, { onConflict: 'session_id' });
    await supabase.from('live_quiz_sessions').update({ status: 'ended', updated_at: now }).eq('id', sessionId);
    await supabase.from('live_quiz_admin_actions').insert({ session_id: sessionId, admin_user_id: user.id, action_type: 'END', payload: { message } });
    return new Response(JSON.stringify({ ok: true, phase: 'ended', message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
