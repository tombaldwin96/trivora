-- Rate limit: 20 friend requests per user per day (rolling 24 hours).
CREATE OR REPLACE FUNCTION public.send_friend_request(p_to_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_exists BOOLEAN;
  v_sent_last_24h INT;
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

  SELECT COUNT(*)::INT INTO v_sent_last_24h
  FROM public.friend_requests
  WHERE from_user_id = v_me
    AND created_at > (NOW() - INTERVAL '24 hours');

  IF v_sent_last_24h >= 20 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'rate_limit');
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

COMMENT ON FUNCTION public.send_friend_request(UUID) IS 'Send a friend request. Rate limited to 20 per user per 24 hours.';
