-- Restore total_daily_quizzes_completed increment in on_attempt_completed (was dropped in 20250220000011).
-- Then re-backfill so everyone's "Days played" matches their completed daily attempts.

CREATE OR REPLACE FUNCTION public.on_attempt_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_count INT;
  v_correct INT;
  v_incorrect INT;
BEGIN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.mode = 'daily' THEN
    -- Daily: score_total is 0-1000 points. Get correct/incorrect from detail_json.
    SELECT COUNT(*)::INT INTO v_correct
    FROM jsonb_array_elements(COALESCE(NEW.detail_json, '[]'::jsonb)) AS e
    WHERE (e->>'correct')::boolean = true;
    v_incorrect := GREATEST(0, 10 - COALESCE(v_correct, 0));
    PERFORM public.increment_profile_stats_for_user(
      NEW.user_id,
      1,
      COALESCE(v_correct, 0),
      v_incorrect
    );
    -- Count this completed daily quiz for "Days played" on the Daily Quiz tab.
    UPDATE public.profiles
    SET total_daily_quizzes_completed = total_daily_quizzes_completed + 1,
        updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Non-daily: score_total = number of correct answers (legacy behavior).
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

COMMENT ON FUNCTION public.on_attempt_completed() IS 'On attempt end: for daily mode use detail_json for correct/incorrect and increment total_daily_quizzes_completed; else use score_total as correct count.';

-- Re-backfill so existing users see correct "Days played" (count of completed daily attempts).
UPDATE public.profiles p
SET total_daily_quizzes_completed = COALESCE(sub.cnt, 0)
FROM (
  SELECT user_id, COUNT(*)::INT AS cnt
  FROM public.attempts
  WHERE mode = 'daily' AND ended_at IS NOT NULL
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;
