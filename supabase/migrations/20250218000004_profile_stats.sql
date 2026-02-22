-- Add quiz/correct/incorrect stats to profiles for profile page and leaderboard context.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_quizzes_taken INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions_correct INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions_incorrect INT NOT NULL DEFAULT 0;

-- Backfill from attempts (completed attempts only)
UPDATE public.profiles p
SET
  total_quizzes_taken = COALESCE(c.quiz_count, 0),
  total_questions_correct = COALESCE(c.correct_sum, 0)
FROM (
  SELECT
    user_id,
    COUNT(*)::INT AS quiz_count,
    COALESCE(SUM(score_total), 0)::INT AS correct_sum
  FROM public.attempts
  WHERE ended_at IS NOT NULL
  GROUP BY user_id
) c
WHERE p.id = c.user_id;

-- Optional: set total_questions_incorrect from attempts if we had that stored (we don't per row), so leave at 0 for backfill.
-- New games will increment via RPC below.

-- RPC: increment profile stats (e.g. after Quick Fire or any quiz). Call as authenticated user.
CREATE OR REPLACE FUNCTION public.increment_profile_stats(
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
  IF p_quizzes_delta = 0 AND p_correct_delta = 0 AND p_incorrect_delta = 0 THEN
    RETURN;
  END IF;
  UPDATE public.profiles
  SET
    total_quizzes_taken = GREATEST(0, total_quizzes_taken + p_quizzes_delta),
    total_questions_correct = GREATEST(0, total_questions_correct + p_correct_delta),
    total_questions_incorrect = GREATEST(0, total_questions_incorrect + p_incorrect_delta),
    updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_profile_stats(INT, INT, INT) TO authenticated;
