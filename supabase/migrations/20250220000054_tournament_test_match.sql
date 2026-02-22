-- Tournament test flow: two phones tap "Test" to get a Round of 32 match with full tournament animations.

ALTER TABLE public.matches_1v1
  ADD COLUMN IF NOT EXISTS tournament_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches_1v1.tournament_test IS 'True for test tournament matches (Test button); uses Round of 32 intro and Advance/Eliminated animations.';

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

  -- Try to claim an existing waiting test match (created in last 5 minutes)
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

    -- Create 10 round questions (same as 1v1 host)
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

    -- Set intro and game start (server time)
    v_intro_started_at := NOW();
    UPDATE public.matches_1v1
    SET
      intro_started_at = v_intro_started_at,
      intro_duration_ms = v_intro_ms,
      match_start_at = v_intro_started_at + (v_intro_ms || ' ms')::interval,
      game_starts_at = v_intro_started_at + (v_intro_ms || ' ms')::interval,
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

  -- Create new waiting test match (qualify RETURNING columns to avoid conflict with OUT params)
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

COMMENT ON FUNCTION public.tournament_test_enter(UUID) IS
  'Tournament test: join existing waiting test match or create one. Second player gets rounds + intro timestamps. Use match screen with tournament_test=true for Round of 32 animations.';

GRANT EXECUTE ON FUNCTION public.tournament_test_enter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_test_enter(UUID) TO service_role;
