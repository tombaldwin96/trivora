-- 1) Abandon all current sessions for a user: close every pending/in_progress match they're in.
--    If there is an opponent, award the opponent the win. Then they can start fresh with Quick match.
-- 2) quick_match_enter: never return an existing session; always abandon first, then claim or create.

-- Abandon every pending/in_progress match for this user (call from quick_match_enter before claim/create).
CREATE OR REPLACE FUNCTION public.abandon_my_1v1_sessions(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_winner_id UUID;
BEGIN
  FOR v_match IN
    SELECT id, season_id, status, player_a, player_b, points_a, points_b
    FROM public.matches_1v1
    WHERE status IN ('pending', 'in_progress')
      AND (player_a = p_user_id OR player_b = p_user_id)
    FOR UPDATE
  LOOP
    IF v_match.player_b IS NOT NULL THEN
      -- Two players: the one who didn't leave (p_user_id is the leaver) gets the win.
      v_winner_id := CASE WHEN p_user_id = v_match.player_a THEN v_match.player_b ELSE v_match.player_a END;
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
      WHERE id = v_match.id;

      UPDATE public.standings
      SET
        games_played = games_played + 1,
        wins = wins + CASE WHEN user_id = v_winner_id THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN user_id != v_winner_id THEN 1 ELSE 0 END,
        updated_at = NOW()
      WHERE season_id = v_match.season_id
        AND user_id IN (v_match.player_a, v_match.player_b);
    ELSE
      -- Only player_a was waiting (no opponent yet): just close the match, no winner.
      UPDATE public.matches_1v1
      SET
        status = 'completed',
        ended_at = NOW(),
        result = jsonb_build_object('winner_id', NULL, 'score_a', 0, 'score_b', 0),
        updated_at = NOW()
      WHERE id = v_match.id;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.abandon_my_1v1_sessions(UUID) IS
  'Closes all pending/in_progress 1v1 matches for this user; awards the opponent the win when there is one.';

GRANT EXECUTE ON FUNCTION public.abandon_my_1v1_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_my_1v1_sessions(UUID) TO service_role;


-- Quick match: abandon any current session first, then never return existing match — only claim or create.
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

  -- Close any session this user is in (opponent gets the win). Then always start fresh.
  PERFORM public.abandon_my_1v1_sessions(p_user_id);

  -- Claim a waiting match only if creator is online and match is recent.
  EXECUTE format(
    $q$
    SELECT m.id, m.player_a, m.started_at
    FROM public.matches_1v1 m
    INNER JOIN public.profiles p ON p.id = m.player_a
    WHERE m.season_id = $1 AND m.division = $2 AND m.status = 'pending'
      AND m.player_b IS NULL AND m.player_a != $3
      AND p.last_seen_at IS NOT NULL
      AND p.last_seen_at > (NOW() - INTERVAL '2 minutes')
      AND m.created_at > (NOW() - INTERVAL '5 minutes')
    ORDER BY m.created_at ASC
    LIMIT 1
    FOR UPDATE OF m SKIP LOCKED
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

  -- Create a new match slot.
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
  'Abandons any current session (opponent gets win), then claims an online waiting match or creates a new one. Never returns an existing session.';
