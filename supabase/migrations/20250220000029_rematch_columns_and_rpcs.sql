-- Rematch: allow players to request rematch after a completed 1v1; when both agree, create a new match.

ALTER TABLE public.matches_1v1
  ADD COLUMN IF NOT EXISTS rematch_requested_a BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rematch_requested_b BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rematch_match_id UUID NULL;

COMMENT ON COLUMN public.matches_1v1.rematch_requested_a IS 'Player A clicked Rematch after match completed.';
COMMENT ON COLUMN public.matches_1v1.rematch_requested_b IS 'Player B clicked Rematch after match completed.';
COMMENT ON COLUMN public.matches_1v1.rematch_match_id IS 'New match id when both requested rematch; both players navigate here.';

CREATE OR REPLACE FUNCTION public.request_rematch(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RETURN; END IF;

  SELECT id, status, player_a, player_b
  INTO v_match
  FROM public.matches_1v1
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match.id IS NULL OR v_match.status != 'completed' OR v_match.player_b IS NULL THEN
    RETURN;
  END IF;

  IF v_caller_id = v_match.player_a THEN
    UPDATE public.matches_1v1 SET rematch_requested_a = TRUE, updated_at = NOW() WHERE id = p_match_id;
  ELSIF v_caller_id = v_match.player_b THEN
    UPDATE public.matches_1v1 SET rematch_requested_b = TRUE, updated_at = NOW() WHERE id = p_match_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.request_rematch(UUID) IS 'Mark that the caller wants a rematch (same two players).';

GRANT EXECUTE ON FUNCTION public.request_rematch(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_rematch_match(p_match_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_new_id UUID;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RETURN NULL; END IF;

  SELECT id, season_id, division, status, player_a, player_b, rematch_requested_a, rematch_requested_b, rematch_match_id
  INTO v_match
  FROM public.matches_1v1
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_match.id IS NULL OR v_match.status != 'completed' OR v_match.player_b IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_caller_id != v_match.player_a AND v_caller_id != v_match.player_b THEN
    RETURN NULL;
  END IF;

  IF v_match.rematch_match_id IS NOT NULL THEN
    RETURN v_match.rematch_match_id;
  END IF;

  IF NOT (v_match.rematch_requested_a AND v_match.rematch_requested_b) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b)
  VALUES (v_match.season_id, v_match.division, 'pending', v_match.player_a, v_match.player_b)
  RETURNING id INTO v_new_id;

  UPDATE public.matches_1v1
  SET rematch_match_id = v_new_id, updated_at = NOW()
  WHERE id = p_match_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_rematch_match(UUID) IS 'When both players requested rematch, create a new match and return its id. Idempotent.';

GRANT EXECUTE ON FUNCTION public.create_rematch_match(UUID) TO authenticated;
