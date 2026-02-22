-- Add optional p_viewer_id to get_user_profile_card. When provided, include your record vs them (h2h_wins, h2h_draws, h2h_losses).
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
    country, avatar_url, bio
  INTO v_username, v_created_at, v_xp, v_level,
    v_quizzes_taken, v_questions_correct, v_questions_incorrect,
    v_country, v_avatar_url, v_bio
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_username IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(wins), 0), COALESCE(SUM(draws), 0), COALESCE(SUM(losses), 0)
  INTO v_total_wins, v_total_draws, v_total_losses
  FROM public.standings
  WHERE user_id = p_user_id;

  -- Head-to-head: completed matches between viewer and profile user (viewer's wins, draws, losses).
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
    'h2h_wins', v_h2h_wins,
    'h2h_draws', v_h2h_draws,
    'h2h_losses', v_h2h_losses
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_user_profile_card(UUID, UUID) IS 'Public profile card. When p_viewer_id is provided, includes h2h_wins, h2h_draws, h2h_losses (viewer vs profile user).';
