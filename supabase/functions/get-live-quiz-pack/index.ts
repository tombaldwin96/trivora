import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Returns ordered question pack for a live quiz session.
 * Body: { session_id, limit? }
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
    const sessionId = body.session_id ?? body.sessionId;
    const limit = body.limit != null ? Math.min(100, Math.max(1, Number(body.limit))) : null;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing session_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: session } = await supabase
      .from('live_quiz_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!session || !['draft', 'scheduled', 'live', 'ended'].includes(session.status)) {
      return new Response(JSON.stringify({ error: 'Session not found or not accessible' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let query = supabase
      .from('live_quiz_session_questions')
      .select('position, question_id, questions(id, prompt, answers_json, correct_index, explanation, time_limit_ms, category_id, categories(name))')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });

    if (limit != null) query = query.limit(limit);
    const { data: rows, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const questions = (rows ?? []).map((r: { position: number; question_id: string; questions: unknown }) => {
      const q = r.questions as {
        id: string;
        prompt: string;
        answers_json: unknown;
        correct_index: number;
        explanation: string | null;
        time_limit_ms: number;
        category_id: string;
        categories: { name: string } | null;
      } | null;
      if (!q) return null;
      const options = Array.isArray(q.answers_json) ? q.answers_json : [];
      const numOptions = Math.max(2, options.length);
      const rawCorrect = q.correct_index ?? 0;
      const correct_index = Math.max(0, Math.min(Number(rawCorrect), numOptions - 1));
      return {
        id: q.id,
        position: r.position,
        prompt: q.prompt,
        options,
        correct_index,
        explanation: q.explanation ?? null,
        time_limit_ms: q.time_limit_ms ?? 15000,
        category: q.categories?.name ?? null,
      };
    }).filter(Boolean);

    return new Response(
      JSON.stringify({ session_id: sessionId, questions }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
