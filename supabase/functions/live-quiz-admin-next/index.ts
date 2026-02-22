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
    if (!sessionId) return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const supabase = getSupabaseService();
    const { data: state } = await supabase.from('live_quiz_state').select('current_question_index').eq('session_id', sessionId).single();
    if (!state) return new Response(JSON.stringify({ error: 'Session state not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const nextIndex = state.current_question_index + 1;
    const now = new Date().toISOString();
    const { error: stateErr } = await supabase.from('live_quiz_state').update({ phase: 'open', current_question_index: nextIndex, question_started_at: now, reveal_started_at: null, updated_at: now }).eq('session_id', sessionId);
    if (stateErr) return new Response(JSON.stringify({ error: stateErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    await supabase.from('live_quiz_admin_actions').insert({ session_id: sessionId, admin_user_id: user.id, action_type: 'NEXT', payload: { previous_index: state.current_question_index, new_index: nextIndex } });
    return new Response(JSON.stringify({ ok: true, phase: 'open', current_question_index: nextIndex, question_started_at: now }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
