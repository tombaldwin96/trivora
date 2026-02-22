-- Log of admin-sent push notifications (for history and AAA dashboard).

CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  target TEXT NOT NULL CHECK (target IN ('all', 'ios', 'android')),
  recipient_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_push_notification_log_created_by ON public.push_notification_log(created_by);
CREATE INDEX IF NOT EXISTS idx_push_notification_log_sent_at ON public.push_notification_log(sent_at DESC);

COMMENT ON TABLE public.push_notification_log IS 'Admin push notification history for dashboard and auditing.';

-- RPC: token counts by platform (for admin compose UI). Admin only.
CREATE OR REPLACE FUNCTION public.get_admin_push_token_counts()
RETURNS TABLE(platform TEXT, token_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT pt.platform::TEXT, COUNT(*)::BIGINT
  FROM public.push_tokens pt
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
  GROUP BY pt.platform
  ORDER BY pt.platform;
$$;

COMMENT ON FUNCTION public.get_admin_push_token_counts() IS 'Returns platform and count of push tokens for admin send UI.';

-- RPC: recent push notification log (admin only).
CREATE OR REPLACE FUNCTION public.get_admin_push_notification_log(p_limit INT DEFAULT 50)
RETURNS TABLE(
  id UUID,
  title TEXT,
  body TEXT,
  target TEXT,
  recipient_count INT,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  meta_json JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    l.id,
    l.title,
    l.body,
    l.target,
    l.recipient_count,
    l.sent_at,
    l.created_by,
    l.meta_json
  FROM public.push_notification_log l
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  ORDER BY l.sent_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

COMMENT ON FUNCTION public.get_admin_push_notification_log(INT) IS 'Returns recent admin push notifications for dashboard.';
