-- 1) Prevent live_quiz_win_count from being decreased or set arbitrarily.
--    Only allowed: unchanged, or increment by exactly 1 (via increment_live_quiz_win_count).
CREATE OR REPLACE FUNCTION public.live_quiz_win_count_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.live_quiz_win_count IS DISTINCT FROM OLD.live_quiz_win_count THEN
    IF NEW.live_quiz_win_count < OLD.live_quiz_win_count THEN
      RAISE EXCEPTION 'live_quiz_win_count cannot be decreased';
    END IF;
    IF NEW.live_quiz_win_count != OLD.live_quiz_win_count + 1 THEN
      RAISE EXCEPTION 'live_quiz_win_count can only be incremented by 1 (use increment_live_quiz_win_count)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_quiz_win_count_guard_trigger ON public.profiles;
CREATE TRIGGER live_quiz_win_count_guard_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.live_quiz_win_count IS DISTINCT FROM OLD.live_quiz_win_count)
  EXECUTE PROCEDURE public.live_quiz_win_count_guard();

-- 2) Add live_quiz_win_count to get_user_profile_card so profile cards show ★ everywhere.
CREATE OR REPLACE FUNCTION public.get_user_profile_card(p_user_id UUID, p_viewer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  v_username TEXT;
  v_created_at TIMESTAMPTZ;
  v_xp INT;
  v_level INT;
  v_quizzes_taken INT;
  v_questions_correct INT;
  v_questions_incorrect INT;
  v_total_wins BIGINT;
  v_total_draws BIGINT;
  v_total_losses BIGINT;
  v_country TEXT;
  v_avatar_url TEXT;
  v_bio TEXT;
  v_live_quiz_win_count INT;
  v_h2h_wins INT := 0;
  v_h2h_draws INT := 0;
  v_h2h_losses INT := 0;
  v_rec RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT username, created_at, xp, level,
    total_quizzes_taken, total_questions_correct, total_questions_incorrect,
    country, avatar_url, bio, live_quiz_win_count
  INTO v_username, v_created_at, v_xp, v_level,
    v_quizzes_taken, v_questions_correct, v_questions_incorrect,
    v_country, v_avatar_url, v_bio, v_live_quiz_win_count
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_username IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(wins), 0), COALESCE(SUM(draws), 0), COALESCE(SUM(losses), 0)
  INTO v_total_wins, v_total_draws, v_total_losses
  FROM public.standings
  WHERE user_id = p_user_id;

  IF p_viewer_id IS NOT NULL AND p_viewer_id != p_user_id THEN
    FOR v_rec IN
      SELECT m.result
      FROM public.matches_1v1 m
      WHERE m.status = 'completed'
        AND m.player_b IS NOT NULL
        AND (
          (m.player_a = p_viewer_id AND m.player_b = p_user_id)
          OR (m.player_a = p_user_id AND m.player_b = p_viewer_id)
        )
    LOOP
      IF (v_rec.result->>'winner_id') IS NULL THEN
        v_h2h_draws := v_h2h_draws + 1;
      ELSIF (v_rec.result->>'winner_id')::UUID = p_viewer_id THEN
        v_h2h_wins := v_h2h_wins + 1;
      ELSE
        v_h2h_losses := v_h2h_losses + 1;
      END IF;
    END LOOP;
  END IF;

  result := jsonb_build_object(
    'username', COALESCE(v_username, ''),
    'joined_at', v_created_at,
    'xp', COALESCE(v_xp, 0),
    'level', COALESCE(v_level, 1),
    'total_quizzes_completed', COALESCE(v_quizzes_taken, 0),
    'total_wins', COALESCE(v_total_wins, 0)::INT,
    'total_draws', COALESCE(v_total_draws, 0)::INT,
    'total_losses', COALESCE(v_total_losses, 0)::INT,
    'total_questions_correct', COALESCE(v_questions_correct, 0),
    'total_questions_incorrect', COALESCE(v_questions_incorrect, 0),
    'country', v_country,
    'avatar_url', v_avatar_url,
    'bio', v_bio,
    'live_quiz_win_count', COALESCE(v_live_quiz_win_count, 0),
    'h2h_wins', v_h2h_wins,
    'h2h_draws', v_h2h_draws,
    'h2h_losses', v_h2h_losses
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_user_profile_card(UUID, UUID) IS 'Public profile card. Includes live_quiz_win_count (★ on username). When p_viewer_id provided, includes h2h.';

-- 3) Add live_quiz_win_count to get_daily_quiz_leaderboard so daily leaderboard shows ★.
-- Must DROP first because return type (OUT parameters) is changing.
DROP FUNCTION IF EXISTS public.get_daily_quiz_leaderboard(INT);
CREATE OR REPLACE FUNCTION public.get_daily_quiz_leaderboard(p_limit INT DEFAULT 100)
RETURNS TABLE (
  rank INT,
  user_id UUID,
  username TEXT,
  score INT,
  live_quiz_win_count INT
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
    r.rn::INT,
    r.user_id,
    COALESCE(p.username, 'Anonymous')::TEXT,
    r.score,
    COALESCE(p.live_quiz_win_count, 0)::INT
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.rn <= GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  ORDER BY r.rn;
END;
$$;

COMMENT ON FUNCTION public.get_daily_quiz_leaderboard(INT) IS
  'Today''s daily quiz leaderboard (UTC). Returns username, score, live_quiz_win_count for ★ display.';
