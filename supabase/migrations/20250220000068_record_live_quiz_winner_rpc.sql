-- RPC for admin to record live quiz winner when ending via direct path (e.g. admin panel fallback).
-- Edge function live-quiz-admin-end already does this; this allows the admin panel's runActionDirect('end') to record the winner too.
CREATE OR REPLACE FUNCTION public.record_live_quiz_winner(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can record live quiz winner';
  END IF;

  -- Top scorer for this session (excluding kicked), same logic as live-quiz-admin-end
  SELECT ls.user_id INTO v_winner_id
  FROM (
    SELECT lq.user_id
    FROM public.live_quiz_scores lq
    WHERE lq.session_id = p_session_id
      AND NOT EXISTS (SELECT 1 FROM public.live_quiz_kicked k WHERE k.session_id = p_session_id AND k.user_id = lq.user_id)
    ORDER BY lq.total_score DESC, lq.last_updated_at ASC
    LIMIT 1
  ) ls;

  IF v_winner_id IS NOT NULL THEN
    INSERT INTO public.live_quiz_winners (session_id, user_id, created_at)
    VALUES (p_session_id, v_winner_id, v_now)
    ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, created_at = EXCLUDED.created_at;
    PERFORM public.increment_live_quiz_win_count(v_winner_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_live_quiz_winner(UUID) IS 'Admin-only: record rank-1 for session in live_quiz_winners and increment their live_quiz_win_count. Used when ending quiz via admin panel direct path.';

GRANT EXECUTE ON FUNCTION public.record_live_quiz_winner(UUID) TO authenticated;
