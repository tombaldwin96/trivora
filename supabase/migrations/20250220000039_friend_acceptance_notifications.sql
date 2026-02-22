-- Notifications for "X has accepted your friend request" (shown on friends icon).
CREATE TABLE public.friend_acceptance_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accepted_by_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_friend_acceptance_notifications_user_unread
  ON public.friend_acceptance_notifications(user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.friend_acceptance_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY friend_acceptance_notifications_select ON public.friend_acceptance_notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY friend_acceptance_notifications_update ON public.friend_acceptance_notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Notify the requester (from_user_id) when their request is accepted. Insert is done by accept_friend_request (SECURITY DEFINER).
CREATE POLICY friend_acceptance_notifications_insert ON public.friend_acceptance_notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Allow service role / definer to insert for any user (we use a trigger with SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.notify_friend_request_accepted(
  p_recipient_user_id UUID,
  p_accepted_by_username TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.friend_acceptance_notifications (user_id, accepted_by_username)
  VALUES (p_recipient_user_id, p_accepted_by_username);
END;
$$;

-- Update accept_friend_request to create the notification for the requester.
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
  UPDATE public.friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = p_request_id;
  INSERT INTO public.friends (user_id, friend_id) VALUES (v_me, v_from), (v_from, v_me)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  -- Notify the person who sent the request (v_from) that v_me (accepter) accepted.
  SELECT COALESCE(username, 'Someone') INTO v_my_username FROM public.profiles WHERE id = v_me;
  PERFORM public.notify_friend_request_accepted(v_from, v_my_username);
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- Mark one or all of my acceptance notifications as read (e.g. after showing alert on friends icon tap).
CREATE OR REPLACE FUNCTION public.mark_friend_acceptance_notifications_read(p_notification_ids UUID[] DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_notification_ids IS NULL OR array_length(p_notification_ids, 1) IS NULL THEN
    UPDATE public.friend_acceptance_notifications SET read_at = NOW() WHERE user_id = auth.uid() AND read_at IS NULL;
  ELSE
    UPDATE public.friend_acceptance_notifications SET read_at = NOW()
    WHERE user_id = auth.uid() AND id = ANY(p_notification_ids);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_friend_acceptance_notifications_read(UUID[]) TO authenticated;

COMMENT ON TABLE public.friend_acceptance_notifications IS 'In-app notifications: "X has accepted your friend request". Cleared when user views on friends icon.';
