-- Fix daily quiz leaderboard: include any published daily quiz, use score_total (0-1000) and fallback to detail_json.
CREATE OR REPLACE FUNCTION public.get_daily_quiz_leaderboard(p_limit INT DEFAULT 100)
RETURNS TABLE (
  rank INT,
  user_id UUID,
  username TEXT,
  score INT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  RETURN QUERY
  WITH daily_attempts AS (
    SELECT
      a.user_id,
      a.score_total,
      a.detail_json,
      -- Use score_total when > 0; else compute from detail_json (points per answer)
      CASE
        WHEN COALESCE(a.score_total, 0) > 0 THEN a.score_total
        ELSE (
          SELECT COALESCE(SUM((elem->>'points')::int), 0)::int
          FROM jsonb_array_elements(COALESCE(a.detail_json, '[]'::jsonb)) AS elem
        )
      END AS computed_score
    FROM public.attempts a
    WHERE a.quiz_id IN (
      SELECT q.id FROM public.quizzes q
      WHERE q.type = 'daily' AND q.status = 'published'
    )
      AND a.ended_at IS NOT NULL
      AND (a.started_at AT TIME ZONE 'UTC')::date = v_today
  ),
  best_today AS (
    SELECT
      da.user_id,
      max(da.computed_score)::INT AS score
    FROM daily_attempts da
    GROUP BY da.user_id
  ),
  ranked AS (
    SELECT
      bt.user_id,
      bt.score,
      row_number() OVER (ORDER BY bt.score DESC)::INT AS rn
    FROM best_today bt
  )
  SELECT
    r.rn AS rank,
    r.user_id,
    COALESCE(p.username, 'Anonymous')::TEXT AS username,
    r.score
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.rn <= GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  ORDER BY r.rn;
END;
$$;

COMMENT ON FUNCTION public.get_daily_quiz_leaderboard(INT) IS
  'Returns today''s daily quiz leaderboard (UTC). Score is 0-1000 from attempts.score_total or sum of points in detail_json.';
