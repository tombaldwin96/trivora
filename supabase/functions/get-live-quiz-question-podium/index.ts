import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseService } from '../_shared/live_quiz.ts';

/**
 * Returns top 3 scorers for a given question (for post-reveal podium).
 * Body: { session_id, question_id }
 * Response: { entries: [ { rank, user_id, username, elapsed_ms, score_awarded } ] }
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
    const questionId = body.question_id ?? body.questionId;

    if (!sessionId || !questionId) {
      return new Response(JSON.stringify({ error: 'Missing session_id or question_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseService();

    const { data: answers } = await supabase
      .from('live_quiz_answers')
      .select('user_id, elapsed_ms, score_awarded')
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
      .eq('is_correct', true)
      .order('score_awarded', { ascending: false })
      .limit(3);

    const rows = (answers ?? []) as { user_id: string; elapsed_ms: number; score_awarded: number }[];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ entries: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, live_quiz_win_count')
      .in('id', rows.map((r) => r.user_id));

    const profileMap = Object.fromEntries(
      ((profiles ?? []) as { id: string; username: string | null; live_quiz_win_count: number }[]).map((p) => [p.id, p])
    );

    const entries = rows.map((r, i) => {
      const p = profileMap[r.user_id];
      return {
        rank: i + 1,
        user_id: r.user_id,
        username: p?.username ?? '—',
        live_quiz_win_count: p?.live_quiz_win_count ?? 0,
        elapsed_ms: r.elapsed_ms,
        score_awarded: r.score_awarded,
      };
    });

    return new Response(
      JSON.stringify({ entries }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
