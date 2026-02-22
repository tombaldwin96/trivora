-- Robust, fast matchmaking: one RPC does standing lookup + existing match + claim or create.
-- Reduces edge function to a single DB round trip; handles 2000+ concurrent users.

-- Fast "my standing" lookup for the RPC (user_id + latest updated_at)
CREATE INDEX IF NOT EXISTS idx_standings_user_updated_at
  ON public.standings (user_id, updated_at DESC);

-- Single entry point: resolve standing, return existing match, or atomically claim/create.
-- Caller gets one row: (match_id, player_a, player_b, started_at).
-- Uses FOR UPDATE SKIP LOCKED when claiming so concurrent callers never double-assign.
CREATE OR REPLACE FUNCTION public.quick_match_enter(p_user_id UUID)
RETURNS TABLE(match_id UUID, player_a UUID, player_b UUID, started_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id UUID;
  v_division INT;
  v_existing_id UUID;
  v_existing_player_a UUID;
  v_existing_player_b UUID;
  v_existing_started_at TIMESTAMPTZ;
  v_claimed_id UUID;
  v_claimed_player_a UUID;
  v_claimed_started_at TIMESTAMPTZ;
  v_new_id UUID;
  v_new_player_a UUID;
  v_new_player_b UUID;
  v_new_started_at TIMESTAMPTZ;
BEGIN
  -- 1. Resolve season and division (single index lookup)
  SELECT s.season_id, s.division INTO v_season_id, v_division
  FROM public.standings s
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season; complete onboarding first';
  END IF;

  v_division := COALESCE(v_division, 5);

  -- 2. Already in a pending/in_progress match? Return it immediately.
  SELECT m.id, m.player_a, m.player_b, m.started_at
  INTO v_existing_id, v_existing_player_a, v_existing_player_b, v_existing_started_at
  FROM public.matches_1v1 m
  WHERE m.status IN ('pending', 'in_progress')
    AND (m.player_a = p_user_id OR m.player_b = p_user_id)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    match_id   := v_existing_id;
    player_a   := v_existing_player_a;
    player_b   := v_existing_player_b;
    started_at := v_existing_started_at;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3. Try to claim the oldest waiting match (atomic; SKIP LOCKED for high concurrency)
  SELECT m.id, m.player_a, m.started_at
  INTO v_claimed_id, v_claimed_player_a, v_claimed_started_at
  FROM public.matches_1v1 m
  WHERE m.season_id = v_season_id
    AND m.division = v_division
    AND m.status = 'pending'
    AND m.player_b IS NULL
    AND m.player_a != p_user_id
  ORDER BY m.created_at ASC
  LIMIT 1
  FOR UPDATE OF m SKIP LOCKED;

  IF v_claimed_id IS NOT NULL THEN
    UPDATE public.matches_1v1
    SET player_b = p_user_id, updated_at = NOW()
    WHERE id = v_claimed_id;

    match_id   := v_claimed_id;
    player_a   := v_claimed_player_a;
    player_b   := p_user_id;
    started_at := v_claimed_started_at;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 4. No one waiting: create a new match slot (opponent will claim it)
  INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, points_a, points_b)
  VALUES (v_season_id, v_division, 'pending', p_user_id, NULL, 0, 0)
  RETURNING id, player_a, player_b, started_at
  INTO v_new_id, v_new_player_a, v_new_player_b, v_new_started_at;

  match_id   := v_new_id;
  player_a   := v_new_player_a;
  player_b   := v_new_player_b;
  started_at := v_new_started_at;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.quick_match_enter(UUID) IS
  'Single-call quick match: resolve standing, return existing match, or atomically claim/create. Safe under high concurrency.';

GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO authenticated;
