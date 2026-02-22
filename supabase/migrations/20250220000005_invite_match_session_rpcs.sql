-- Invite match flow: create session (match with only player_a), invite by username, accept/decline.
-- Realtime on invites so inviter and invitee get updates.

-- 1) create_invite_session: create a match with player_a = caller, player_b = null; return match_id.
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

  INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, points_a, points_b)
  VALUES (v_season_id, v_division, 'pending', uid, NULL, 0, 0)
  RETURNING id INTO v_match_id;

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION public.create_invite_session() IS 'Create a 1v1 match with only player_a (inviter). Used for invite-by-username flow.';
GRANT EXECUTE ON FUNCTION public.create_invite_session() TO authenticated;

-- 2) invite_by_username: from match page, send invite to user with given username.
--    Caller must be match.player_a and match.player_b must be null.
CREATE OR REPLACE FUNCTION public.invite_by_username(p_match_id UUID, p_to_username TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  to_id UUID;
  m_player_a UUID;
  m_player_b UUID;
  inv_id UUID;
  code TEXT;
BEGIN
  IF uid IS NULL OR p_to_username IS NULL OR trim(p_to_username) = '' THEN
    RAISE EXCEPTION 'Invalid input';
  END IF;

  -- Match must exist and caller must be host, no opponent yet
  SELECT player_a, player_b INTO m_player_a, m_player_b
  FROM public.matches_1v1
  WHERE id = p_match_id AND status = 'pending';

  IF m_player_a IS NULL OR m_player_a != uid OR m_player_b IS NOT NULL THEN
    RAISE EXCEPTION 'Match not found or you cannot invite for this match';
  END IF;

  -- Resolve username (case-insensitive, trim)
  SELECT id INTO to_id
  FROM public.profiles
  WHERE lower(trim(username)) = lower(trim(p_to_username))
  LIMIT 1;

  IF to_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF to_id = uid THEN
    RAISE EXCEPTION 'You cannot invite yourself';
  END IF;

  -- Unique code for this invite (required by table; in-app invites use uuid)
  code := 'app-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.invites (from_user, to_user, channel, deep_link_code, mode, status, match_id)
  VALUES (uid, to_id, 'app', code, '1v1', 'pending', p_match_id)
  RETURNING id INTO inv_id;

  RETURN inv_id;
END;
$$;

COMMENT ON FUNCTION public.invite_by_username(UUID, TEXT) IS 'Send in-app invite to a user by username for an existing invite-session match.';
GRANT EXECUTE ON FUNCTION public.invite_by_username(UUID, TEXT) TO authenticated;

-- 3) respond_to_invite: invitee accepts or declines. Accept: set match.player_b and invite status; decline: set status only.
CREATE OR REPLACE FUNCTION public.respond_to_invite(p_invite_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  inv RECORD;
  out_match_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id, to_user, from_user, status, match_id
  INTO inv
  FROM public.invites
  WHERE id = p_invite_id;

  IF inv.id IS NULL OR inv.to_user != uid OR inv.status != 'pending' THEN
    RAISE EXCEPTION 'Invite not found or already responded';
  END IF;

  IF p_accept THEN
    IF inv.match_id IS NULL THEN
      RAISE EXCEPTION 'Invite has no session';
    END IF;
    UPDATE public.matches_1v1
    SET player_b = uid, updated_at = NOW()
    WHERE id = inv.match_id AND player_b IS NULL AND status = 'pending';
    UPDATE public.invites
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = p_invite_id;
    out_match_id := inv.match_id;
  ELSE
    UPDATE public.invites
    SET status = 'declined'
    WHERE id = p_invite_id;
    out_match_id := NULL;
  END IF;

  RETURN jsonb_build_object('accepted', p_accept, 'match_id', out_match_id);
END;
$$;

COMMENT ON FUNCTION public.respond_to_invite(UUID, BOOLEAN) IS 'Accept or decline an in-app invite. Accept joins the match as player_b.';
GRANT EXECUTE ON FUNCTION public.respond_to_invite(UUID, BOOLEAN) TO authenticated;

-- 4) Realtime for invites (inviter sees status changes; invitee sees new rows)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invites;
EXCEPTION
  WHEN SQLSTATE '42710' THEN NULL;
END
$$;
