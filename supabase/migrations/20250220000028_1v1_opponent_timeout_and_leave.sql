-- 1) finalize_1v1_opponent_timeout: caller has finished, opponent has not; award caller the win (e.g. after 12s wait).
-- 2) leave_1v1_match: caller forfeits; award the other player the win and update standings.

CREATE OR REPLACE FUNCTION public.finalize_1v1_opponent_timeout(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_caller_id UUID;
  v_rounds_total INT;
  v_caller_done INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, season_id, status, player_a, player_b, points_a, points_b
  INTO v_match
  FROM public.matches_1v1
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match.id IS NULL THEN
    RETURN;
  END IF;

  IF v_match.status != 'in_progress' OR v_match.player_b IS NULL THEN
    RETURN;
  END IF;

  IF v_caller_id != v_match.player_a AND v_caller_id != v_match.player_b THEN
    RETURN;
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE (v_caller_id = v_match.player_a AND a_answer IS NOT NULL) OR (v_caller_id = v_match.player_b AND b_answer IS NOT NULL))
  INTO v_rounds_total, v_caller_done
  FROM public.match_rounds
  WHERE match_id = p_match_id;

  IF v_rounds_total = 0 OR v_caller_done < v_rounds_total THEN
    RETURN;
  END IF;

  -- Opponent has not finished (caller has). Award caller the win.
  UPDATE public.matches_1v1
  SET
    status = 'completed',
    ended_at = NOW(),
    result = jsonb_build_object(
      'winner_id', v_caller_id,
      'score_a', v_match.points_a,
      'score_b', v_match.points_b
    ),
    updated_at = NOW()
  WHERE id = p_match_id;

  UPDATE public.standings
  SET
    games_played = games_played + 1,
    wins = wins + CASE WHEN user_id = v_caller_id THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN user_id != v_caller_id THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE season_id = v_match.season_id
    AND user_id IN (v_match.player_a, v_match.player_b);
END;
$$;

COMMENT ON FUNCTION public.finalize_1v1_opponent_timeout(UUID) IS
  'When caller has finished and opponent has not, mark match completed and award caller the win.';

GRANT EXECUTE ON FUNCTION public.finalize_1v1_opponent_timeout(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.leave_1v1_match(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_caller_id UUID;
  v_winner_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, season_id, status, player_a, player_b, points_a, points_b
  INTO v_match
  FROM public.matches_1v1
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match.id IS NULL THEN
    RETURN;
  END IF;

  IF v_match.status != 'in_progress' OR v_match.player_b IS NULL THEN
    RETURN;
  END IF;

  IF v_caller_id != v_match.player_a AND v_caller_id != v_match.player_b THEN
    RETURN;
  END IF;

  v_winner_id := CASE WHEN v_caller_id = v_match.player_a THEN v_match.player_b ELSE v_match.player_a END;

  UPDATE public.matches_1v1
  SET
    status = 'completed',
    ended_at = NOW(),
    result = jsonb_build_object(
      'winner_id', v_winner_id,
      'score_a', v_match.points_a,
      'score_b', v_match.points_b
    ),
    updated_at = NOW()
  WHERE id = p_match_id;

  UPDATE public.standings
  SET
    games_played = games_played + 1,
    wins = wins + CASE WHEN user_id = v_winner_id THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN user_id != v_winner_id THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE season_id = v_match.season_id
    AND user_id IN (v_match.player_a, v_match.player_b);
END;
$$;

COMMENT ON FUNCTION public.leave_1v1_match(UUID) IS
  'Caller forfeits the match; the other player is awarded the win.';

GRANT EXECUTE ON FUNCTION public.leave_1v1_match(UUID) TO authenticated;
