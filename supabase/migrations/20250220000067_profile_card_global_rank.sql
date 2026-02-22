-- Add global rank (by XP) to get_user_profile_card for display on profile cards.
-- Rank = 1 + number of users with strictly greater XP (ties get same rank by convention: count strictly greater).
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
  v_live_quizzes_participated INT := 0;
  v_live_quiz_top_10_finishes INT := 0;
  v_h2h_wins INT := 0;
  v_h2h_draws INT := 0;
  v_h2h_losses INT := 0;
  v_global_rank INT := NULL;
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

  -- Global rank by XP (1 = highest XP). Ties: everyone with same XP gets rank = 1 + count(strictly greater).
  SELECT (COUNT(*)::INT + 1) INTO v_global_rank
  FROM public.profiles p2
  WHERE p2.xp > v_xp;

  SELECT COALESCE(SUM(wins), 0), COALESCE(SUM(draws), 0), COALESCE(SUM(losses), 0)
  INTO v_total_wins, v_total_draws, v_total_losses
  FROM public.standings
  WHERE user_id = p_user_id;

  -- Live quiz stats: participated = distinct sessions; top 10 = sessions where rank by total_score <= 10
  SELECT COUNT(DISTINCT session_id) INTO v_live_quizzes_participated
  FROM public.live_quiz_scores
  WHERE user_id = p_user_id;

  SELECT COUNT(*)::INT INTO v_live_quiz_top_10_finishes
  FROM (
    SELECT 1
    FROM public.live_quiz_scores lq
    WHERE lq.user_id = p_user_id
      AND (
        SELECT COUNT(DISTINCT lq2.user_id)
        FROM public.live_quiz_scores lq2
        WHERE lq2.session_id = lq.session_id
          AND lq2.total_score > lq.total_score
      ) < 10
  ) x;

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
    'global_rank', v_global_rank,
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
    'live_quizzes_participated', COALESCE(v_live_quizzes_participated, 0),
    'live_quiz_top_10_finishes', COALESCE(v_live_quiz_top_10_finishes, 0),
    'h2h_wins', v_h2h_wins,
    'h2h_draws', v_h2h_draws,
    'h2h_losses', v_h2h_losses
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_user_profile_card(UUID, UUID) IS 'Public profile card. Includes global_rank (by XP), live stats, h2h when p_viewer_id provided.';
