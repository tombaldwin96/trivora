-- Daily quiz uses score_total as 0-1000 points; trigger must not treat it as "correct count".
-- For mode = 'daily', derive correct/incorrect from detail_json. Other modes unchanged.

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
  v_elem JSONB;
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

COMMENT ON FUNCTION public.on_attempt_completed() IS 'On attempt end: for daily mode use detail_json for correct/incorrect; else use score_total as correct count.';
