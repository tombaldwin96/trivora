-- Friend requests: pending / accepted / declined. On accept, insert into friends (both directions for symmetric list).
CREATE TABLE public.friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id),
  CHECK (from_user_id != to_user_id)
);

CREATE INDEX idx_friend_requests_from ON public.friend_requests(from_user_id);
CREATE INDEX idx_friend_requests_to ON public.friend_requests(to_user_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(to_user_id, status) WHERE status = 'pending';

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY friend_requests_select ON public.friend_requests FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());
CREATE POLICY friend_requests_insert ON public.friend_requests FOR INSERT
  WITH CHECK (from_user_id = auth.uid());
CREATE POLICY friend_requests_update ON public.friend_requests FOR UPDATE
  USING (to_user_id = auth.uid());

CREATE TRIGGER friend_requests_updated_at BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RPC: send a friend request (insert pending). Fails if already friends or request exists.
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

-- RPC: accept a friend request (to_user_id = me). Inserts both (me, from) and (from, me) into friends.
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
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  SELECT from_user_id, to_user_id INTO v_from, v_to
  FROM public.friend_requests WHERE id = p_request_id AND to_user_id = v_me AND status = 'pending';
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'request_not_found');
  END IF;
  UPDATE public.friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = p_request_id;
  INSERT INTO public.friends (user_id, friend_id) VALUES (v_me, v_from), (v_from, v_me)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- RPC: decline a friend request
CREATE OR REPLACE FUNCTION public.decline_friend_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  UPDATE public.friend_requests SET status = 'declined', updated_at = NOW()
  WHERE id = p_request_id AND to_user_id = auth.uid() AND status = 'pending';
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- RPC: list my friends with profile and online status (last_seen_at within 5 min = online)
CREATE OR REPLACE FUNCTION public.get_my_friends_with_status()
RETURNS TABLE(
  friend_id UUID,
  username TEXT,
  display_name TEXT,
  last_seen_at TIMESTAMPTZ,
  is_online BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id AS friend_id,
    p.username,
    p.display_name,
    p.last_seen_at,
    (p.last_seen_at IS NOT NULL AND p.last_seen_at > (NOW() - INTERVAL '5 minutes')) AS is_online
  FROM public.profiles p
  WHERE p.id IN (
    SELECT f.friend_id FROM public.friends f WHERE f.user_id = auth.uid()
    UNION
    SELECT f.user_id FROM public.friends f WHERE f.friend_id = auth.uid()
  )
  ORDER BY p.username;
$$;
