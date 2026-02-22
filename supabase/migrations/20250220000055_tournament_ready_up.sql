-- Tournament test: 10s wait on head-to-head then both Ready up → game starts at same time.

ALTER TABLE public.matches_1v1
  ADD COLUMN IF NOT EXISTS ready_a BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ready_b BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches_1v1.ready_a IS 'Tournament test: player A has tapped Ready up.';
COMMENT ON COLUMN public.matches_1v1.ready_b IS 'Tournament test: player B has tapped Ready up.';

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
BEGIN
  SELECT m.player_a, m.player_b, m.ready_a, m.ready_b, m.tournament_test
  INTO v_player_a, v_player_b, v_ready_a, v_ready_b, v_tournament_test
  FROM public.matches_1v1 m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF v_player_a IS NULL OR v_tournament_test IS NOT TRUE THEN
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

  -- When both ready, set match_start_at and game_starts_at so both clients start together
  SELECT m.ready_a, m.ready_b INTO v_ready_a, v_ready_b
  FROM public.matches_1v1 m WHERE m.id = p_match_id;

  -- Start countdown 4s in future so both clients receive update in time to see vs → 3 → 2 → 1
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

COMMENT ON FUNCTION public.set_tournament_ready(UUID, UUID) IS
  'Tournament test: mark current user ready; when both ready, set match_start_at and game_starts_at so game starts in sync.';

GRANT EXECUTE ON FUNCTION public.set_tournament_ready(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tournament_ready(UUID, UUID) TO service_role;

-- When second player joins tournament test, set intro only; do NOT set match_start_at/game_starts_at (set when both ready)
CREATE OR REPLACE FUNCTION public.tournament_test_enter(p_user_id UUID)
RETURNS TABLE(match_id UUID, player_a UUID, player_b UUID, started_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id UUID;
  v_claimed_id UUID;
  v_claimed_player_a UUID;
  v_claimed_started_at TIMESTAMPTZ;
  v_new_id UUID;
  v_new_pa UUID;
  v_new_pb UUID;
  v_new_started_at TIMESTAMPTZ;
  v_intro_started_at TIMESTAMPTZ;
  v_intro_ms INT := 7000;
  v_round_count INT;
  v_limit INT;
BEGIN
  SELECT id INTO v_season_id FROM public.seasons ORDER BY created_at DESC LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No season found';
  END IF;

  SELECT m.id, m.player_a, m.started_at
  INTO v_claimed_id, v_claimed_player_a, v_claimed_started_at
  FROM public.matches_1v1 m
  WHERE m.tournament_test = true
    AND m.status = 'pending'
    AND m.player_b IS NULL
    AND m.player_a != p_user_id
    AND m.created_at > (NOW() - INTERVAL '5 minutes')
  ORDER BY m.created_at ASC
  LIMIT 1
  FOR UPDATE OF m SKIP LOCKED;

  IF v_claimed_id IS NOT NULL THEN
    UPDATE public.matches_1v1
    SET player_b = p_user_id, updated_at = NOW()
    WHERE id = v_claimed_id;

    INSERT INTO public.match_rounds (match_id, question_id)
    SELECT v_claimed_id, q.id FROM public.get_random_questions(10, '{}') q LIMIT 10;
    GET DIAGNOSTICS v_round_count = ROW_COUNT;
    IF v_round_count < 10 THEN
      v_limit := 10 - v_round_count;
      INSERT INTO public.match_rounds (match_id, question_id)
      SELECT v_claimed_id, id FROM public.questions
      WHERE is_active = true AND id NOT IN (SELECT question_id FROM public.match_rounds WHERE match_id = v_claimed_id)
      ORDER BY random() LIMIT v_limit;
    END IF;

    -- Set intro only; match_start_at and game_starts_at are set when both tap Ready up
    v_intro_started_at := NOW();
    UPDATE public.matches_1v1
    SET
      intro_started_at = v_intro_started_at,
      intro_duration_ms = v_intro_ms,
      status = 'in_progress',
      started_at = v_intro_started_at,
      updated_at = NOW()
    WHERE id = v_claimed_id;

    match_id := v_claimed_id;
    player_a := v_claimed_player_a;
    player_b := p_user_id;
    started_at := v_claimed_started_at;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, tournament_test)
  VALUES (v_season_id, 1, 'pending', p_user_id, NULL, true)
  RETURNING public.matches_1v1.id, public.matches_1v1.player_a, public.matches_1v1.player_b, public.matches_1v1.started_at
  INTO v_new_id, v_new_pa, v_new_pb, v_new_started_at;

  match_id := v_new_id;
  player_a := v_new_pa;
  player_b := v_new_pb;
  started_at := v_new_started_at;
  RETURN NEXT;
END;
$$;
