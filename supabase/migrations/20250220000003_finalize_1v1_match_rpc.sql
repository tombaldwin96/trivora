-- Finalize a 1v1 match when both players have answered all rounds.
-- Sets status=completed, result json, and updates standings (wins/draws/losses).

CREATE OR REPLACE FUNCTION public.finalize_1v1_match(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_rounds_done INT;
  v_rounds_total INT;
  v_winner_id UUID;
BEGIN
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

  SELECT COUNT(*), COUNT(*) FILTER (WHERE a_answer IS NOT NULL AND b_answer IS NOT NULL)
  INTO v_rounds_total, v_rounds_done
  FROM public.match_rounds
  WHERE match_id = p_match_id;

  IF v_rounds_total = 0 OR v_rounds_done < v_rounds_total THEN
    RETURN;
  END IF;

  IF v_match.points_a > v_match.points_b THEN
    v_winner_id := v_match.player_a;
  ELSIF v_match.points_b > v_match.points_a THEN
    v_winner_id := v_match.player_b;
  ELSE
    v_winner_id := NULL;
  END IF;

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
    draws = draws + CASE WHEN v_winner_id IS NULL THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN v_winner_id IS NOT NULL AND user_id != v_winner_id THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE season_id = v_match.season_id
    AND user_id IN (v_match.player_a, v_match.player_b);
END;
$$;

COMMENT ON FUNCTION public.finalize_1v1_match(UUID) IS
  'Marks match completed and updates standings when both players have answered all rounds.';

GRANT EXECUTE ON FUNCTION public.finalize_1v1_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_1v1_match(UUID) TO service_role;
