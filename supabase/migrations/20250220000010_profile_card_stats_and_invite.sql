-- Profile card: correct stats (wins/losses from standings, correct/incorrect from profiles), for leaderboard modal.
CREATE OR REPLACE FUNCTION public.get_user_profile_card(p_user_id UUID)
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
  v_total_losses BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT username, created_at, xp, level,
    total_quizzes_taken, total_questions_correct, total_questions_incorrect
  INTO v_username, v_created_at, v_xp, v_level,
    v_quizzes_taken, v_questions_correct, v_questions_incorrect
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_username IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(wins), 0), COALESCE(SUM(losses), 0)
  INTO v_total_wins, v_total_losses
  FROM public.standings
  WHERE user_id = p_user_id;

  result := jsonb_build_object(
    'username', COALESCE(v_username, ''),
    'joined_at', v_created_at,
    'xp', COALESCE(v_xp, 0),
    'level', COALESCE(v_level, 1),
    'total_quizzes_completed', COALESCE(v_quizzes_taken, 0),
    'total_wins', COALESCE(v_total_wins, 0)::INT,
    'total_losses', COALESCE(v_total_losses, 0)::INT,
    'total_questions_correct', COALESCE(v_questions_correct, 0),
    'total_questions_incorrect', COALESCE(v_questions_incorrect, 0)
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_user_profile_card(UUID) IS 'Public profile card for leaderboard: username, level, xp, quizzes, wins, losses, correct/incorrect, joined_at.';
