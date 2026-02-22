-- Scale quick match: atomic claim of a waiting match so thousands of concurrent users
-- never double-assign the same match. Indexes keep lookups fast.

-- Index: find "my" existing match (pending or in_progress) by player_a or player_b
CREATE INDEX idx_matches_1v1_player_a_active
  ON public.matches_1v1 (player_a)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_matches_1v1_player_b_active
  ON public.matches_1v1 (player_b)
  WHERE status IN ('pending', 'in_progress') AND player_b IS NOT NULL;

-- Index: find oldest waiting match to claim (partial index for the claim query)
CREATE INDEX idx_matches_1v1_waiting_claim
  ON public.matches_1v1 (season_id, division, created_at ASC)
  WHERE status = 'pending' AND player_b IS NULL;

-- Atomically claim one waiting match for the given user.
-- Uses FOR UPDATE SKIP LOCKED so concurrent callers each get a different row; no race.
-- Returns one row (match_id, player_a, player_b, started_at) or none.
CREATE OR REPLACE FUNCTION public.claim_waiting_quick_match(
  p_user_id UUID,
  p_season_id UUID,
  p_division INT
)
RETURNS TABLE(match_id UUID, player_a UUID, player_b UUID, started_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_player_a UUID;
  v_started_at TIMESTAMPTZ;
BEGIN
  -- Select and lock one waiting match (oldest first). SKIP LOCKED so concurrent
  -- callers get different rows; no double-assign under high concurrency.
  SELECT m.id, m.player_a, m.started_at
    INTO v_id, v_player_a, v_started_at
  FROM public.matches_1v1 m
  WHERE m.season_id = p_season_id
    AND m.division = p_division
    AND m.status = 'pending'
    AND m.player_b IS NULL
    AND m.player_a != p_user_id
  ORDER BY m.created_at ASC
  LIMIT 1
  FOR UPDATE OF m SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;  -- no waiting match to claim
  END IF;

  -- Claim it (single row update)
  UPDATE public.matches_1v1
  SET player_b = p_user_id, updated_at = NOW()
  WHERE id = v_id;

  match_id   := v_id;
  player_a   := v_player_a;
  player_b   := p_user_id;
  started_at := v_started_at;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.claim_waiting_quick_match(UUID, UUID, INT) IS
  'Atomically claim one waiting 1v1 match for quick match; safe under high concurrency.';

GRANT EXECUTE ON FUNCTION public.claim_waiting_quick_match(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_waiting_quick_match(UUID, UUID, INT) TO service_role;
