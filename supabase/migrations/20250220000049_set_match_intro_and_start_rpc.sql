-- Server sets intro/match_start/game_starts_at with NOW() so both clients share the same timestamps.
-- Call after rounds exist (host creates rounds, then calls this).

CREATE OR REPLACE FUNCTION public.set_match_intro_and_start(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intro_started_at TIMESTAMPTZ := NOW();
  v_intro_duration_ms INT := 7000;
  v_match_start_at TIMESTAMPTZ;
  v_game_starts_at TIMESTAMPTZ;
BEGIN
  UPDATE public.matches_1v1
  SET
    intro_started_at = v_intro_started_at,
    intro_duration_ms = v_intro_duration_ms,
    match_start_at = v_intro_started_at + (v_intro_duration_ms || ' ms')::interval,
    game_starts_at = v_intro_started_at + (v_intro_duration_ms || ' ms')::interval,
    status = 'in_progress',
    started_at = v_intro_started_at,
    updated_at = NOW()
  WHERE id = p_match_id
    AND status = 'pending'
    AND player_b IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.set_match_intro_and_start(UUID) IS
  'Sets intro_started_at, match_start_at, game_starts_at (server time) and status=in_progress. Call after rounds are created.';

GRANT EXECUTE ON FUNCTION public.set_match_intro_and_start(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_match_intro_and_start(UUID) TO service_role;
