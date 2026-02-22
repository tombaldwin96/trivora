-- Total daily quizzes completed: count only attempts where mode = 'daily' and ended_at IS NOT NULL.
-- Used on the Daily Quiz tab; streak is computed from the same attempts (consecutive days completed).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_daily_quizzes_completed INT NOT NULL DEFAULT 0;

-- When an attempt is completed, also increment total_daily_quizzes_completed when mode = 'daily'.
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

  IF NEW.mode = 'daily' THEN
    UPDATE public.profiles
    SET total_daily_quizzes_completed = total_daily_quizzes_completed + 1,
        updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill from existing completed daily attempts.
UPDATE public.profiles p
SET total_daily_quizzes_completed = COALESCE(sub.cnt, 0)
FROM (
  SELECT user_id, COUNT(*)::INT AS cnt
  FROM public.attempts
  WHERE mode = 'daily' AND ended_at IS NOT NULL
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;
