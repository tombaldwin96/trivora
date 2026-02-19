-- RPC: get public profile card stats for any user (for leaderboard tap).
-- Returns: username, country, joined_at, total_quizzes_completed, total_questions_correct.
-- Uses SECURITY DEFINER to read attempts for any user (RLS otherwise restricts to own attempts).

CREATE OR REPLACE FUNCTION public.get_user_profile_card(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  v_username TEXT;
  v_country TEXT;
  v_created_at TIMESTAMPTZ;
  v_quizzes_completed BIGINT;
  v_questions_correct BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT username, country, created_at
  INTO v_username, v_country, v_created_at
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_username IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
  INTO v_quizzes_completed
  FROM public.attempts
  WHERE user_id = p_user_id AND ended_at IS NOT NULL;

  SELECT COALESCE(SUM(score_total), 0)::BIGINT
  INTO v_questions_correct
  FROM public.attempts
  WHERE user_id = p_user_id AND ended_at IS NOT NULL;

  result := jsonb_build_object(
    'username', COALESCE(v_username, ''),
    'country', COALESCE(v_country, ''),
    'joined_at', v_created_at,
    'total_quizzes_completed', COALESCE(v_quizzes_completed, 0),
    'total_questions_correct', COALESCE(v_questions_correct, 0)
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_profile_card(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile_card(UUID) TO anon;
