-- Presence: last_seen_at for "online in last N minutes" and map of online users by country.

-- Add last_seen_at to profiles (updated by app heartbeat when user has app open)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at)
  WHERE last_seen_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.last_seen_at IS 'Set by app heartbeat; used to show "online in last N minutes" on map.';

-- RPC: update current user's last_seen_at (call from app every ~1–2 min while app is active)
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_at = NOW(), updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.update_last_seen() IS 'Heartbeat: call from app while active to mark user as online for map.';

-- RPC: get online user counts by country (for map markers). Only users seen in last p_minutes with country set.
CREATE OR REPLACE FUNCTION public.get_online_users_by_country(p_minutes INT DEFAULT 10)
RETURNS TABLE(country_code TEXT, user_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    TRIM(UPPER(p.country))::TEXT AS country_code,
    COUNT(*)::BIGINT AS user_count
  FROM public.profiles p
  WHERE p.country IS NOT NULL
    AND TRIM(p.country) <> ''
    AND p.last_seen_at IS NOT NULL
    AND p.last_seen_at > (NOW() - (p_minutes || ' minutes')::INTERVAL)
  GROUP BY TRIM(UPPER(p.country))
  ORDER BY user_count DESC;
$$;

COMMENT ON FUNCTION public.get_online_users_by_country(INT) IS 'Returns country code and count of users online in last p_minutes (for world map).';
