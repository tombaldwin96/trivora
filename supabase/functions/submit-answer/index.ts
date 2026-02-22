import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MIN_HUMAN_MS = 300;
const BASE_POINTS = 100;
const MAX_TIME_BONUS = 50;

/** Default (e.g. Quick Fire) scoring. */
function scoreAnswer(correct: boolean, timeMs: number, timeLimitMs: number): number {
  if (!correct) return 0;
  const clamped = Math.max(timeMs, MIN_HUMAN_MS);
  const bonus = timeLimitMs > 0
    ? Math.round(MAX_TIME_BONUS * (1 - clamped / timeLimitMs))
    : 0;
  return BASE_POINTS + Math.max(0, bonus);
}

/** Daily quiz: 100 pts if correct within 1s; lose 8 pts per second after 1s. Incorrect = 0. */
const DAILY_MAX_POINTS = 100;
const DAILY_BONUS_SECONDS = 1;
const DAILY_POINTS_LOST_PER_SECOND = 8;
const POINTS_PER_MS = DAILY_POINTS_LOST_PER_SECOND / 1000;

function scoreDailyAnswer(correct: boolean, timeMs: number): number {
  if (!correct) return 0;
  const ms = Number(timeMs) || 0;
  if (ms <= DAILY_BONUS_SECONDS * 1000) return DAILY_MAX_POINTS;
  const overMs = ms - DAILY_BONUS_SECONDS * 1000;
  const lost = overMs * POINTS_PER_MS;
  return Math.max(0, Math.round(DAILY_MAX_POINTS - lost));
}

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
    const { attempt_id, question_id, answer_index, time_ms } = body;
    if (attempt_id == null || question_id == null || answer_index == null || time_ms == null) {
      return new Response(JSON.stringify({ error: 'Missing attempt_id, question_id, answer_index, or time_ms' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, user_id, quiz_id, mode, detail_json, ended_at')
      .eq('id', attempt_id)
      .single();

    if (!attempt || attempt.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Attempt not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (attempt.ended_at) {
      return new Response(JSON.stringify({ error: 'Attempt already ended' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: question } = await supabase
      .from('questions')
      .select('correct_index, time_limit_ms')
      .eq('id', question_id)
      .single();

    if (!question) {
      return new Response(JSON.stringify({ error: 'Question not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const correct = question.correct_index === Number(answer_index);
    const timeLimitMs = question.time_limit_ms ?? 60000;
    const isDaily = attempt.mode === 'daily';
    const points = isDaily
      ? scoreDailyAnswer(correct, Number(time_ms))
      : scoreAnswer(correct, Number(time_ms), timeLimitMs);

    const details: unknown[] = Array.isArray(attempt.detail_json) ? [...attempt.detail_json] : [];
    details.push({
      questionId: question_id,
      answerIndex: answer_index,
      correct,
      timeMs: time_ms,
      points,
    });

    const total = details.reduce((sum: number, d: { points?: number }) => sum + (d.points ?? 0), 0);

    const { error: updateErr } = await supabase
      .from('attempts')
      .update({ detail_json: details, score_total: total })
      .eq('id', attempt_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        correct,
        points,
        total_score: total,
        attempt_id,
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
