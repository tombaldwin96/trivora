-- Fix quick_match_enter: same "player_a/player_b is ambiguous" as try_claim.
-- Use composite type + subqueries + dynamic SQL so return columns don't shadow table columns.

-- Ensure type exists (try_claim migration may have created it).
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

DROP FUNCTION IF EXISTS public.quick_match_enter(UUID);

CREATE OR REPLACE FUNCTION public.quick_match_enter(p_user_id UUID)
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
  v_new_id UUID;
  v_new_player_a UUID;
  v_new_player_b UUID;
  v_new_started_at TIMESTAMPTZ;
  r public.quick_match_result;
BEGIN
  SELECT s.season_id, s.division INTO v_season_id, v_division
  FROM public.standings s
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season; complete onboarding first';
  END IF;

  v_division := COALESCE(v_division, 5);

  -- 2. Already in a pending/in_progress match? Return it. (Subquery avoids player_a/player_b ambiguity.)
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

  -- 3. Try to claim oldest waiting match. (Dynamic SQL avoids ambiguity.)
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
    RETURN;
  END IF;

  -- 4. Create new match. (Dynamic SQL so RETURNING column names not in scope.)
  EXECUTE format(
    $q$
    INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, points_a, points_b)
    VALUES ($1, $2, 'pending', $3, NULL, 0, 0)
    RETURNING id, player_a, player_b, started_at
    $q$
  ) INTO v_new_id, v_new_player_a, v_new_player_b, v_new_started_at
  USING v_season_id, v_division, p_user_id;

  r.match_id := v_new_id;
  r.player_a := v_new_player_a;
  r.player_b := v_new_player_b;
  r.started_at := v_new_started_at;
  RETURN NEXT r;
END;
$$;

COMMENT ON FUNCTION public.quick_match_enter(UUID) IS
  'Single-call quick match: resolve standing, return existing match, or atomically claim/create. Safe under high concurrency.';

GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO authenticated;
