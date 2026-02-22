-- Fix tombaldwin1996's daily quiz score on leaderboard.
-- 1) Backfill score_total from detail_json for their today's daily attempt(s).
-- 2) If detail_json is empty but they scored 650, set score_total = 650 for their latest today attempt (one-off).

DO $$
DECLARE
  v_user_id UUID;
  v_attempt_id UUID;
  v_sum_from_json INT;
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- Resolve user by username (leaderboard shows profiles.username)
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE username = 'tombaldwin1996'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get their latest daily attempt for today
  SELECT a.id INTO v_attempt_id
  FROM public.attempts a
  WHERE a.user_id = v_user_id
    AND a.mode = 'daily'
    AND a.ended_at IS NOT NULL
    AND (a.started_at AT TIME ZONE 'UTC')::date = v_today
  ORDER BY a.ended_at DESC
  LIMIT 1;

  IF v_attempt_id IS NULL THEN
    RETURN;
  END IF;

  -- Sum points from detail_json (safe: missing/invalid -> 0)
  SELECT COALESCE(SUM(
    CASE
      WHEN elem ? 'points' AND (elem->>'points') ~ '^\-?[0-9]+\.?[0-9]*$' THEN (elem->>'points')::numeric
      WHEN elem ? 'Points' AND (elem->>'Points') ~ '^\-?[0-9]+\.?[0-9]*$' THEN (elem->>'Points')::numeric
      ELSE 0
    END
  ), 0)::int INTO v_sum_from_json
  FROM jsonb_array_elements(COALESCE(
    (SELECT detail_json FROM public.attempts WHERE id = v_attempt_id),
    '[]'::jsonb
  )) AS elem;

  IF v_sum_from_json > 0 THEN
    UPDATE public.attempts
    SET score_total = v_sum_from_json
    WHERE id = v_attempt_id;
    RETURN;
  END IF;

  -- detail_json had no summable points: one-off set to 650 (user reported this score)
  UPDATE public.attempts
  SET score_total = 650
  WHERE id = v_attempt_id
    AND COALESCE(score_total, 0) = 0;
END $$;

-- 3) Leaderboard: safe extraction of points (handles 'points' or 'Points', non-numeric -> 0)
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
      CASE
        WHEN jsonb_array_length(COALESCE(a.detail_json, '[]'::jsonb)) > 0 THEN
          (SELECT COALESCE(SUM(
            CASE
              WHEN elem ? 'points' AND (elem->>'points') ~ '^\-?[0-9]+\.?[0-9]*$' THEN (elem->>'points')::numeric
              WHEN elem ? 'Points' AND (elem->>'Points') ~ '^\-?[0-9]+\.?[0-9]*$' THEN (elem->>'Points')::numeric
              ELSE 0
            END
          ), 0)::int
           FROM jsonb_array_elements(COALESCE(a.detail_json, '[]'::jsonb)) AS elem)
        ELSE COALESCE(a.score_total, 0)
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
  'Today''s daily quiz leaderboard (UTC). Score from detail_json points (safe parse) or score_total.';
