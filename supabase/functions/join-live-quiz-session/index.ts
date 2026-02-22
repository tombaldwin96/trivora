import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseService } from '../_shared/live_quiz.ts';

/**
 * Join a live quiz session: ensures the user has a row in live_quiz_scores (0,0,0)
 * so they appear on the leaderboard and can submit answers. Call when opening the session.
 * Body: { session_id }
 */
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

    const anon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await anon.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = body.session_id ?? body.sessionId;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing session_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: session } = await anon
      .from('live_quiz_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!session || !['draft', 'scheduled', 'live', 'ended'].includes(session.status)) {
      return new Response(JSON.stringify({ error: 'Session not found or not joinable' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseService();
    const now = new Date().toISOString();

    await supabase.from('live_quiz_scores').upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        total_score: 0,
        correct_count: 0,
        answered_count: 0,
        last_updated_at: now,
      },
      { onConflict: 'session_id,user_id', ignoreDuplicates: true }
    );

    return new Response(
      JSON.stringify({ ok: true, joined: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
