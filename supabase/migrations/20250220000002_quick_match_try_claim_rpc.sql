-- Search-only matchmaking: try to claim an existing waiting match, never create.
-- Used by client to "search" for 5 seconds before calling quick_match_enter to create.
-- Uses a composite type for return to avoid RETURNS TABLE column names shadowing table columns.

DO $$ BEGIN
  CREATE TYPE public.quick_match_result AS (
    match_id UUID,
    player_a UUID,
    player_b UUID,
    started_at TIMESTAMPTZ
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Must drop first when changing return type (TABLE -> SETOF type).
DROP FUNCTION IF EXISTS public.quick_match_try_claim(UUID);

CREATE OR REPLACE FUNCTION public.quick_match_try_claim(p_user_id UUID)
RETURNS SETOF public.quick_match_result
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
  r public.quick_match_result;
BEGIN
  -- 1. Resolve season and division
  SELECT s.season_id, s.division INTO v_season_id, v_division
  FROM public.standings s
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season; complete onboarding first';
  END IF;

  v_division := COALESCE(v_division, 5);

  -- 2. Already in a pending/in_progress match? Return it. (Subquery aliases avoid player_a/player_b ambiguity with return type.)
  SELECT sub.mid, sub.pa, sub.pb, sub.st
  INTO v_existing_id, v_existing_player_a, v_existing_player_b, v_existing_started_at
  FROM (
    SELECT id AS mid, player_a AS pa, player_b AS pb, started_at AS st
    FROM public.matches_1v1
    WHERE status IN ('pending', 'in_progress')
      AND (player_a = p_user_id OR player_b = p_user_id)
    LIMIT 1
  ) sub;

  IF v_existing_id IS NOT NULL THEN
    r.match_id := v_existing_id;
    r.player_a := v_existing_player_a;
    r.player_b := v_existing_player_b;
    r.started_at := v_existing_started_at;
    RETURN NEXT r;
    RETURN;
  END IF;

  -- 3. Try to claim the oldest waiting match only (no create). Use dynamic SQL to avoid player_a/player_b ambiguity.
  EXECUTE format(
    $q$
    SELECT id, player_a, started_at
    FROM public.matches_1v1
    WHERE season_id = $1 AND division = $2 AND status = 'pending'
      AND player_b IS NULL AND player_a != $3
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
    $q$
  ) INTO v_claimed_id, v_claimed_player_a, v_claimed_started_at
  USING v_season_id, v_division, p_user_id;

  IF v_claimed_id IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.matches_1v1 SET player_b = $1, updated_at = NOW() WHERE id = $2'
    ) USING p_user_id, v_claimed_id;

    r.match_id := v_claimed_id;
    r.player_a := v_claimed_player_a;
    r.player_b := p_user_id;
    r.started_at := v_claimed_started_at;
    RETURN NEXT r;
  END IF;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.quick_match_try_claim(UUID) IS
  'Try to join an existing waiting match only; returns 0 rows if none. Use before quick_match_enter to search first.';

GRANT EXECUTE ON FUNCTION public.quick_match_try_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_try_claim(UUID) TO authenticated;
