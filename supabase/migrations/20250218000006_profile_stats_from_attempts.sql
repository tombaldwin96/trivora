-- Ensure profile stats are updated when ANY game mode completes an attempt (daily quiz, etc.).
-- Quick Fire updates stats via client call to increment_profile_stats; attempt-based modes
-- are covered by this trigger.

-- Internal: increment stats for a specific user (only allowed when p_user_id = auth.uid()).
-- Used by the attempts trigger; not exposed to clients for arbitrary user_id.
CREATE OR REPLACE FUNCTION public.increment_profile_stats_for_user(
  p_user_id UUID,
  p_quizzes_delta INT DEFAULT 0,
  p_correct_delta INT DEFAULT 0,
  p_incorrect_delta INT DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR (p_quizzes_delta = 0 AND p_correct_delta = 0 AND p_incorrect_delta = 0) THEN
    RETURN;
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot update another user''s stats';
  END IF;
  UPDATE public.profiles
  SET
    total_quizzes_taken = GREATEST(0, total_quizzes_taken + p_quizzes_delta),
    total_questions_correct = GREATEST(0, total_questions_correct + p_correct_delta),
    total_questions_incorrect = GREATEST(0, total_questions_incorrect + p_incorrect_delta),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_profile_stats_for_user(UUID, INT, INT, INT) TO authenticated;

-- When an attempt is completed (ended_at set), increment that user's profile stats.
CREATE OR REPLACE FUNCTION public.on_attempt_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_count INT;
  v_incorrect INT;
BEGIN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INT INTO v_question_count
  FROM public.quiz_questions
  WHERE quiz_id = NEW.quiz_id;

  v_question_count := COALESCE(v_question_count, 0);
  v_incorrect := GREATEST(0, v_question_count - COALESCE(NEW.score_total, 0));

  PERFORM public.increment_profile_stats_for_user(
    NEW.user_id,
    1,
    COALESCE(NEW.score_total, 0),
    v_incorrect
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_attempt_completed_trigger ON public.attempts;
CREATE TRIGGER on_attempt_completed_trigger
  AFTER UPDATE OF ended_at ON public.attempts
  FOR EACH ROW
  EXECUTE PROCEDURE public.on_attempt_completed();

-- Backfill total_questions_incorrect from existing completed attempts (additive so Quick Fire stats are preserved).
UPDATE public.profiles p
SET total_questions_incorrect = COALESCE(p.total_questions_incorrect, 0) + COALESCE(sub.incorrect_sum, 0)
FROM (
  SELECT
    a.user_id,
    SUM(GREATEST(0, COALESCE(qc.c, 0) - COALESCE(a.score_total, 0)))::INT AS incorrect_sum
  FROM public.attempts a
  LEFT JOIN (
    SELECT quiz_id, COUNT(*)::INT AS c
    FROM public.quiz_questions
    GROUP BY quiz_id
  ) qc ON qc.quiz_id = a.quiz_id
  WHERE a.ended_at IS NOT NULL
  GROUP BY a.user_id
) sub
WHERE p.id = sub.user_id;
