import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getSupabaseService, computeLiveScore } from '../_shared/live_quiz.ts';

/**
 * Server-authoritative submit for live quiz.
 * Verifies phase=open, time window, clamps elapsed_ms, computes score, upserts answer + aggregate.
 * Body: session_id, question_id, answer_index, elapsed_ms, client_sent_at?, idempotency_key?
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
    const rawAnswerIndex = body.answer_index;
    const answerIndex = typeof rawAnswerIndex === 'number' ? Math.floor(rawAnswerIndex) : parseInt(String(rawAnswerIndex), 10);
    const elapsedMs = typeof body.elapsed_ms === 'number' ? Math.floor(body.elapsed_ms) : parseInt(String(body.elapsed_ms || 0), 10);
    const idempotencyKey = body.idempotency_key ?? body.idempotencyKey ?? null;

    if (!sessionId || !questionId || Number.isNaN(answerIndex) || answerIndex < 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid session_id, question_id, or answer_index' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseService();

    const { data: kicked } = await supabase
      .from('live_quiz_kicked')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (kicked) {
      return new Response(JSON.stringify({ error: 'You have been removed from this session' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: state } = await supabase
      .from('live_quiz_state')
      .select('phase, current_question_index, question_started_at, question_duration_ms')
      .eq('session_id', sessionId)
      .single();

    if (!state || state.phase !== 'open') {
      return new Response(JSON.stringify({ error: 'Answers not open for this question' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: sessionQuestions } = await supabase
      .from('live_quiz_session_questions')
      .select('question_id, position')
      .eq('session_id', sessionId)
      .order('position', { ascending: true });

    const orderedIds = (sessionQuestions ?? []).map((r: { question_id: string }) => r.question_id);
    const currentQuestionId = orderedIds[state.current_question_index];
    if (currentQuestionId !== questionId) {
      return new Response(JSON.stringify({ error: 'Not the current question' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startedAt = state.question_started_at ? new Date(state.question_started_at).getTime() : null;
    const durationMs = state.question_duration_ms ?? 15000;
    const now = Date.now();
    if (startedAt != null) {
      const windowEnd = startedAt + durationMs;
      if (now > windowEnd) {
        return new Response(JSON.stringify({ error: 'Time window closed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: question, error: questionErr } = await supabase
      .from('questions')
      .select('correct_index, answers_json')
      .eq('id', questionId)
      .single();

    if (questionErr || !question) {
      return new Response(JSON.stringify({ error: 'Question not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const answersJson = (question as { answers_json?: unknown }).answers_json;
    const optionsArray = Array.isArray(answersJson) ? answersJson : [];
    const numOptions = Math.max(2, optionsArray.length);
    const rawCorrect = (question as { correct_index?: unknown }).correct_index;
    const parsedCorrect = parseInt(String(rawCorrect ?? 0), 10);
    const correctIndex = Number.isNaN(parsedCorrect)
      ? 0
      : Math.max(0, Math.min(parsedCorrect, numOptions - 1));
    const answerIdx = Number.isNaN(answerIndex) ? -1 : Math.floor(Number(answerIndex));
    if (answerIdx < 0 || answerIdx >= numOptions) {
      return new Response(JSON.stringify({ error: 'Invalid question or answer index' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const correct = correctIndex === answerIdx;
    const clampedElapsed = Math.max(120, Math.min(elapsedMs, durationMs));
    const scoreAwarded = correct ? computeLiveScore(true, clampedElapsed, durationMs) : 0;

    const { data: existing } = await supabase
      .from('live_quiz_answers')
      .select('id, score_awarded, is_correct')
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing && idempotencyKey) {
      const { data: scoresRow } = await supabase
        .from('live_quiz_scores')
        .select('total_score')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          user_total_score: scoresRow?.total_score ?? existing.score_awarded,
          correct: existing.is_correct,
          score_awarded: existing.score_awarded,
          already_submitted: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existing) {
      return new Response(JSON.stringify({ error: 'Already answered this question' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: insertErr } = await supabase.from('live_quiz_answers').insert({
      session_id: sessionId,
      question_id: questionId,
      user_id: user.id,
      answer_index: answerIdx,
      elapsed_ms: clampedElapsed,
      is_correct: correct,
      score_awarded: scoreAwarded,
    });

    if (insertErr) {
      if (insertErr.code === '23505') {
        return new Response(JSON.stringify({ error: 'Already answered this question' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: scores } = await supabase
      .from('live_quiz_scores')
      .select('total_score, correct_count, answered_count')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    const prevTotal = typeof scores?.total_score === 'number' ? scores.total_score : 0;
    const prevCorrect = typeof scores?.correct_count === 'number' ? scores.correct_count : 0;
    const prevAnswered = typeof scores?.answered_count === 'number' ? scores.answered_count : 0;
    const newTotal = prevTotal + scoreAwarded;
    const newCorrect = prevCorrect + (correct ? 1 : 0);
    const newAnswered = prevAnswered + 1;

    const { error: upsertErr } = await supabase.from('live_quiz_scores').upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        total_score: newTotal,
        correct_count: newCorrect,
        answered_count: newAnswered,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,user_id' }
    );

    if (upsertErr) {
      return new Response(JSON.stringify({ error: 'Failed to update score: ' + upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        user_total_score: newTotal,
        correct,
        score_awarded: scoreAwarded,
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
