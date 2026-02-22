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
    const now = new Date().toISOString();
    const { error: stateErr } = await supabase.from('live_quiz_state').update({ phase: 'open', current_question_index: 0, question_started_at: now, countdown_ends_at: null, reveal_started_at: null, updated_at: now }).eq('session_id', sessionId);
    if (stateErr) return new Response(JSON.stringify({ error: stateErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    await supabase.from('live_quiz_sessions').update({ status: 'live', updated_at: now }).eq('id', sessionId);
    await supabase.from('live_quiz_admin_actions').insert({ session_id: sessionId, admin_user_id: user.id, action_type: 'START', payload: { current_question_index: 0 } });
    return new Response(JSON.stringify({ ok: true, phase: 'open', current_question_index: 0, question_started_at: now }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
