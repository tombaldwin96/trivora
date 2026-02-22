-- User block list: blocker blocks blocked. Blocked users cannot be paired in games or send/receive friend requests.
CREATE TABLE public.user_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_blocks_select ON public.user_blocks FOR SELECT
  USING (blocker_id = auth.uid());
CREATE POLICY user_blocks_insert ON public.user_blocks FOR INSERT
  WITH CHECK (blocker_id = auth.uid());
CREATE POLICY user_blocks_delete ON public.user_blocks FOR DELETE
  USING (blocker_id = auth.uid());

-- True if either user has blocked the other (so they must not be paired or allowed friend requests).
CREATE OR REPLACE FUNCTION public.users_blocked_either_way(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = p_user_a AND ub.blocked_id = p_user_b)
       OR (ub.blocker_id = p_user_b AND ub.blocked_id = p_user_a)
  );
$$;

-- Resolve user id by username (case-insensitive) for block-by-username flow.
CREATE OR REPLACE FUNCTION public.get_user_id_by_username(p_username TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
  WHERE lower(trim(username)) = lower(trim(p_username))
    AND is_blocked = FALSE
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_username(TEXT) TO authenticated;

-- Block a user by id (e.g. looked up from username in app).
CREATE OR REPLACE FUNCTION public.block_user(p_blocked_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  IF p_blocked_user_id = v_me THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_block_self');
  END IF;
  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (v_me, p_blocked_user_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  RETURN jsonb_build_object('ok', TRUE);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'user_not_found');
END;
$$;
GRANT EXECUTE ON FUNCTION public.block_user(UUID) TO authenticated;

-- Unblock a user.
CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  DELETE FROM public.user_blocks
  WHERE blocker_id = auth.uid() AND blocked_id = p_blocked_user_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;

-- List users I have blocked (id, username).
CREATE OR REPLACE FUNCTION public.get_my_blocked_users()
RETURNS TABLE(blocked_id UUID, username TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.blocked_id, p.username
  FROM public.user_blocks ub
  JOIN public.profiles p ON p.id = ub.blocked_id
  WHERE ub.blocker_id = auth.uid()
  ORDER BY p.username;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_blocked_users() TO authenticated;

COMMENT ON TABLE public.user_blocks IS 'User-initiated blocks: blocked users cannot be matched in games or send/receive friend requests.';

-- Friend requests: reject if either user has blocked the other.
CREATE OR REPLACE FUNCTION public.send_friend_request(p_to_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  IF p_to_user_id = v_me THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_add_self');
  END IF;
  IF public.users_blocked_either_way(v_me, p_to_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'blocked');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.friends f
    WHERE (f.user_id = v_me AND f.friend_id = p_to_user_id) OR (f.user_id = p_to_user_id AND f.friend_id = v_me)
  ) INTO v_exists;
  IF v_exists THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_friends');
  END IF;
  INSERT INTO public.friend_requests (from_user_id, to_user_id, status)
  VALUES (v_me, p_to_user_id, 'pending');
  RETURN jsonb_build_object('ok', TRUE);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'request_exists');
END;
$$;

-- Accept: do not allow if either has blocked the other.
CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_from UUID;
  v_to UUID;
  v_my_username TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  SELECT from_user_id, to_user_id INTO v_from, v_to
  FROM public.friend_requests WHERE id = p_request_id AND to_user_id = v_me AND status = 'pending';
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'request_not_found');
  END IF;
  IF public.users_blocked_either_way(v_me, v_from) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'blocked');
  END IF;
  UPDATE public.friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = p_request_id;
  INSERT INTO public.friends (user_id, friend_id) VALUES (v_me, v_from), (v_from, v_me)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  SELECT COALESCE(username, 'Someone') INTO v_my_username FROM public.profiles WHERE id = v_me;
  PERFORM public.notify_friend_request_accepted(v_from, v_my_username);
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Quick match try_claim: do not pair with a user who has blocked or is blocked by me.
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
  SELECT s.season_id, s.division INTO v_season_id, v_division
  FROM public.standings s
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season; complete onboarding first';
  END IF;

  v_division := COALESCE(v_division, 5);

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

  EXECUTE format(
    $q$
    SELECT id, player_a, started_at
    FROM public.matches_1v1 m
    WHERE season_id = $1 AND division = $2 AND status = 'pending'
      AND player_b IS NULL AND player_a != $3
      AND NOT public.users_blocked_either_way(m.player_a, $3)
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
GRANT EXECUTE ON FUNCTION public.quick_match_try_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_try_claim(UUID) TO authenticated;

-- Quick match enter: when claiming, exclude blocked users.
DROP FUNCTION IF EXISTS public.quick_match_enter(UUID);
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
  SELECT s.season_id, s.division INTO v_season_id, v_division
  FROM public.standings s
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season; complete onboarding first';
  END IF;

  v_division := COALESCE(v_division, 5);

  -- Subquery with aliases to avoid player_a/player_b shadowing RETURNS TABLE columns
  SELECT sub.mid, sub.pa, sub.pb, sub.st
  INTO v_existing_id, v_existing_player_a, v_existing_player_b, v_existing_started_at
  FROM (
    SELECT m.id AS mid, m.player_a AS pa, m.player_b AS pb, m.started_at AS st
    FROM public.matches_1v1 m
    WHERE m.status IN ('pending', 'in_progress')
      AND (m.player_a = p_user_id OR m.player_b = p_user_id)
    LIMIT 1
  ) sub;

  IF v_existing_id IS NOT NULL THEN
    match_id   := v_existing_id;
    player_a   := v_existing_player_a;
    player_b   := v_existing_player_b;
    started_at := v_existing_started_at;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT sub.cid, sub.cpa, sub.cst
  INTO v_claimed_id, v_claimed_player_a, v_claimed_started_at
  FROM (
    SELECT m.id AS cid, m.player_a AS cpa, m.started_at AS cst
    FROM public.matches_1v1 m
    WHERE m.season_id = v_season_id
      AND m.division = v_division
      AND m.status = 'pending'
      AND m.player_b IS NULL
      AND m.player_a != p_user_id
      AND NOT public.users_blocked_either_way(m.player_a, p_user_id)
    ORDER BY m.created_at ASC
    LIMIT 1
    FOR UPDATE OF m SKIP LOCKED
  ) sub;

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

  -- Dynamic SQL so RETURNING column names are not ambiguous with RETURNS TABLE
  EXECUTE format(
    $q$
    INSERT INTO public.matches_1v1 (season_id, division, status, player_a, player_b, points_a, points_b)
    VALUES ($1, $2, 'pending', $3, NULL, 0, 0)
    RETURNING id, player_a, player_b, started_at
    $q$
  ) INTO v_new_id, v_new_player_a, v_new_player_b, v_new_started_at
  USING v_season_id, v_division, p_user_id;

  match_id   := v_new_id;
  player_a   := v_new_player_a;
  player_b   := v_new_player_b;
  started_at := v_new_started_at;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.quick_match_enter(UUID) TO authenticated;

-- Invite by username: reject if either has blocked the other.
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

  SELECT player_a, player_b INTO m_player_a, m_player_b
  FROM public.matches_1v1
  WHERE id = p_match_id AND status = 'pending';

  IF m_player_a IS NULL OR m_player_a != uid OR m_player_b IS NOT NULL THEN
    RAISE EXCEPTION 'Match not found or you cannot invite for this match';
  END IF;

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

  IF public.users_blocked_either_way(uid, to_id) THEN
    RAISE EXCEPTION 'You cannot invite this user';
  END IF;

  code := 'app-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.invites (from_user, to_user, channel, deep_link_code, mode, status, match_id)
  VALUES (uid, to_id, 'app', code, '1v1', 'pending', p_match_id)
  RETURNING id INTO inv_id;

  RETURN inv_id;
END;
$$;

-- Respond to invite: reject accept if either has blocked the other.
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
    IF public.users_blocked_either_way(uid, inv.from_user) THEN
      RAISE EXCEPTION 'You cannot accept this invite';
    END IF;
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
