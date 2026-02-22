-- Same ready-up flow as tournament test for quick match and invite match:
-- intro only when second joins, 10s wait + both Ready up, then game starts in sync.
-- Outcome overlay: Victory! / Defeat! (persistent until OK, then redirect home).

ALTER TABLE public.matches_1v1
  ADD COLUMN IF NOT EXISTS ready_up_flow BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches_1v1.ready_up_flow IS 'Quick match and invite: use 10s intro + Ready up then start; outcome overlay Victory/Defeat until OK.';

-- Set intro only (no match_start_at/game_starts_at); those are set when both tap Ready up via set_tournament_ready.
CREATE OR REPLACE FUNCTION public.set_match_intro_only(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intro_started_at TIMESTAMPTZ := NOW();
  v_intro_ms INT := 7000;
BEGIN
  UPDATE public.matches_1v1
  SET
    intro_started_at = v_intro_started_at,
    intro_duration_ms = v_intro_ms,
    status = 'in_progress',
    started_at = v_intro_started_at,
    updated_at = NOW()
  WHERE id = p_match_id
    AND status = 'pending'
    AND player_b IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.set_match_intro_only(UUID) IS
  'Sets intro_started_at and status=in_progress only. Use with ready_up_flow; match_start_at/game_starts_at set when both ready.';
GRANT EXECUTE ON FUNCTION public.set_match_intro_only(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_intro_only(UUID) TO service_role;

-- Allow set_tournament_ready for both tournament_test and ready_up_flow matches
CREATE OR REPLACE FUNCTION public.set_tournament_ready(p_match_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_a UUID;
  v_player_b UUID;
  v_ready_a BOOLEAN;
  v_ready_b BOOLEAN;
  v_tournament_test BOOLEAN;
  v_ready_up_flow BOOLEAN;
BEGIN
  SELECT m.player_a, m.player_b, m.ready_a, m.ready_b, m.tournament_test, COALESCE(m.ready_up_flow, false)
  INTO v_player_a, v_player_b, v_ready_a, v_ready_b, v_tournament_test, v_ready_up_flow
  FROM public.matches_1v1 m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF v_player_a IS NULL THEN
    RETURN;
  END IF;
  IF v_tournament_test IS NOT TRUE AND v_ready_up_flow IS NOT TRUE THEN
    RETURN;
  END IF;

  IF p_user_id = v_player_a THEN
    UPDATE public.matches_1v1
    SET ready_a = true, updated_at = NOW()
    WHERE id = p_match_id;
  ELSIF p_user_id = v_player_b THEN
    UPDATE public.matches_1v1
    SET ready_b = true, updated_at = NOW()
    WHERE id = p_match_id;
  ELSE
    RETURN;
  END IF;

  SELECT m.ready_a, m.ready_b INTO v_ready_a, v_ready_b
  FROM public.matches_1v1 m WHERE m.id = p_match_id;

  IF v_ready_a AND v_ready_b THEN
    UPDATE public.matches_1v1
    SET
      match_start_at = NOW(),
      game_starts_at = NOW() + INTERVAL '4 seconds',
      updated_at = NOW()
    WHERE id = p_match_id;
  END IF;
END;
$$;

-- Quick match: set ready_up_flow on create and on claim
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

  UPDATE public.profiles SET last_seen_at = NOW(), updated_at = NOW() WHERE id = p_user_id;

  PERFORM public.abandon_my_1v1_sessions(p_user_id);

  EXECUTE format(
    $q$
    SELECT m.id, m.player_a, m.started_at
    FROM public.matches_1v1 m
    INNER JOIN public.profiles p ON p.id = m.player_a
    WHERE m.season_id = $1 AND m.division = $2 AND m.status = 'pending'
      AND m.player_b IS NULL
      AND m.player_a != $3
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at > (NOW() - INTERVAL '2 minutes')
      AND m.created_at > (NOW() - INTERVAL '2 minutes')
      AND NOT public.users_blocked_either_way(m.player_a, $3)
    ORDER BY m.created_at ASC
    LIMIT 1
    FOR UPDATE OF m SKIP LOCKED
    $q$
  ) INTO v_claimed_id, v_claimed_player_a, v_claimed_started_at
  USING v_season_id, v_division, p_user_id;

  IF v_claimed_id IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.matches_1v1 SET player_b = $1, ready_up_flow = true, updated_at = NOW() WHERE id = $2'
    ) USING p_user_id, v_claimed_id;

    r.match_id := v_claimed_id;
    r.player_a := v_claimed_player_a;
    r.player_b := p_user_id;
    r.started_at := v_claimed_started_at;
    RETURN NEXT r;
    RETURN;
  END IF;

  EXECUTE format(
    $q$
    INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, points_a, points_b, ready_up_flow)
    VALUES ($1, $2, 'pending', $3, NULL, 0, 0, true)
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
  'Quick match: always abandon current sessions first, then claim a brand-new waiting match (≤2 min) or create new. Uses ready-up flow.';
GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO authenticated;

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
  v_claimed_id UUID;
  v_claimed_player_a UUID;
  v_claimed_started_at TIMESTAMPTZ;
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

  PERFORM public.abandon_my_1v1_sessions(p_user_id);

  EXECUTE format(
    $q$
    SELECT m.id, m.player_a, m.started_at
    FROM public.matches_1v1 m
    INNER JOIN public.profiles p ON p.id = m.player_a
    WHERE m.season_id = $1 AND m.division = $2 AND m.status = 'pending'
      AND m.player_b IS NULL AND m.player_a != $3
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at > (NOW() - INTERVAL '2 minutes')
      AND m.created_at > (NOW() - INTERVAL '2 minutes')
      AND NOT public.users_blocked_either_way(m.player_a, $3)
    ORDER BY m.created_at ASC
    LIMIT 1
    FOR UPDATE OF m SKIP LOCKED
    $q$
  ) INTO v_claimed_id, v_claimed_player_a, v_claimed_started_at
  USING v_season_id, v_division, p_user_id;

  IF v_claimed_id IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.matches_1v1 SET player_b = $1, ready_up_flow = true, updated_at = NOW() WHERE id = $2'
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
  'Abandon current sessions, then try to claim one waiting match only. Uses ready-up flow.';
GRANT EXECUTE ON FUNCTION public.quick_match_try_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_try_claim(UUID) TO authenticated;

-- Invite session: set ready_up_flow when creating match
CREATE OR REPLACE FUNCTION public.create_invite_session()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_season_id UUID;
  v_division INT;
  v_match_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT s.season_id, s.division INTO v_season_id, v_division
  FROM public.standings s
  WHERE s.user_id = uid
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season; complete onboarding first';
  END IF;

  v_division := COALESCE(v_division, 5);

  INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, points_a, points_b, ready_up_flow)
  VALUES (v_season_id, v_division, 'pending', uid, NULL, 0, 0, true)
  RETURNING id INTO v_match_id;

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION public.create_invite_session() IS 'Create a 1v1 match with only player_a (inviter). Uses ready-up flow.';
GRANT EXECUTE ON FUNCTION public.create_invite_session() TO authenticated;
