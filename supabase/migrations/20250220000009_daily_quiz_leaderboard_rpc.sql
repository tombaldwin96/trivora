-- Daily quiz leaderboard: highest scores today (UTC). Resets at midnight UTC with the daily questions.

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
  v_quiz_id UUID;
BEGIN
  SELECT q.id INTO v_quiz_id
  FROM public.quizzes q
  WHERE q.type = 'daily' AND q.status = 'published'
  LIMIT 1;

  IF v_quiz_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH best_today AS (
    SELECT
      a.user_id,
      max(a.score_total)::INT AS score
    FROM public.attempts a
    WHERE a.quiz_id = v_quiz_id
      AND a.ended_at IS NOT NULL
      AND (a.started_at AT TIME ZONE 'UTC')::date = v_today
    GROUP BY a.user_id
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
  'Returns today''s daily quiz leaderboard (UTC date). Resets at midnight UTC.';

GRANT EXECUTE ON FUNCTION public.get_daily_quiz_leaderboard(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_quiz_leaderboard(INT) TO anon;
