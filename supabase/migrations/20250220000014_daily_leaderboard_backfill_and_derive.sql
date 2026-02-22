-- 1) Backfill score_total from detail_json for daily attempts that have 0 but have answer data.
UPDATE public.attempts a
SET score_total = sub.sum_points
FROM (
  SELECT
    a2.id,
    (SELECT COALESCE(SUM((e->>'points')::numeric), 0)::int
     FROM jsonb_array_elements(COALESCE(a2.detail_json, '[]'::jsonb)) e) AS sum_points
  FROM public.attempts a2
  WHERE a2.mode = 'daily'
    AND a2.ended_at IS NOT NULL
    AND COALESCE(a2.score_total, 0) = 0
    AND jsonb_array_length(COALESCE(a2.detail_json, '[]'::jsonb)) > 0
) sub
WHERE a.id = sub.id AND sub.sum_points > 0;

-- 2) Leaderboard: always derive score from detail_json when present (source of truth), else score_total.
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
      -- Prefer sum of points from detail_json when we have entries; else score_total
      CASE
        WHEN jsonb_array_length(COALESCE(a.detail_json, '[]'::jsonb)) > 0 THEN
          (SELECT COALESCE(SUM((elem->>'points')::numeric), 0)::int
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
  'Today''s daily quiz leaderboard (UTC). Score from detail_json points sum when present, else score_total.';
