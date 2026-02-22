-- Admin stats: hourly online snapshots, optional city on profiles, and RPCs for stats dashboard.

-- Hourly snapshot of "online users" count (for graph: highest online per hour).
CREATE TABLE IF NOT EXISTS public.online_user_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket_utc TIMESTAMPTZ NOT NULL,
  user_count BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bucket_utc)
);

CREATE INDEX IF NOT EXISTS idx_online_user_snapshots_bucket
  ON public.online_user_snapshots(bucket_utc DESC);

COMMENT ON TABLE public.online_user_snapshots IS 'Hourly snapshots of online user count for admin graph. Populate via record_online_snapshot() (e.g. cron every hour).';

-- Record current online count for this hour (upsert so one row per hour).
CREATE OR REPLACE FUNCTION public.record_online_snapshot()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TIMESTAMPTZ := date_trunc('hour', NOW());
  v_count  BIGINT;
BEGIN
  SELECT COUNT(*)::BIGINT INTO v_count
  FROM public.profiles
  WHERE last_seen_at IS NOT NULL
    AND last_seen_at > (NOW() - INTERVAL '10 minutes');
  INSERT INTO public.online_user_snapshots (bucket_utc, user_count)
  VALUES (v_bucket, v_count)
  ON CONFLICT (bucket_utc) DO UPDATE SET user_count = EXCLUDED.user_count, created_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.record_online_snapshot() IS 'Record current online user count for this hour. Call hourly for admin graph.';

-- Optional city (e.g. for "connections per UK city"). App can set when location available.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN public.profiles.city IS 'Optional city name for admin stats (e.g. UK cities). Set by app when location/city available.';

-- RPC: current online count (for admin "right now").
CREATE OR REPLACE FUNCTION public.get_admin_current_online()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.profiles
  WHERE last_seen_at IS NOT NULL
    AND last_seen_at > (NOW() - INTERVAL '10 minutes');
$$;

-- RPC: hourly snapshots for graph (last N hours).
CREATE OR REPLACE FUNCTION public.get_admin_online_snapshots(p_hours INT DEFAULT 24)
RETURNS TABLE(bucket_utc TIMESTAMPTZ, user_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.bucket_utc, s.user_count
  FROM public.online_user_snapshots s
  WHERE s.bucket_utc >= (NOW() - (p_hours || ' hours')::INTERVAL)
  ORDER BY s.bucket_utc ASC;
$$;

-- RPC: game mode play counts (attempts by mode + completed 1v1 matches).
CREATE OR REPLACE FUNCTION public.get_admin_game_mode_plays()
RETURNS TABLE(mode_name TEXT, play_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT mode::TEXT AS mode_name, COUNT(*)::BIGINT AS play_count
  FROM public.attempts
  GROUP BY mode
  UNION ALL
  SELECT '1v1 (matches completed)'::TEXT, COUNT(*)::BIGINT
  FROM public.matches_1v1
  WHERE status = 'completed';
$$;

-- RPC: screen_view events grouped by screen/path (where people spend time).
CREATE OR REPLACE FUNCTION public.get_admin_screen_view_stats()
RETURNS TABLE(screen_or_path TEXT, event_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COALESCE(
      NULLIF(TRIM(properties->>'screen'), ''),
      NULLIF(TRIM(properties->>'path'), ''),
      'unknown'
    )::TEXT AS screen_or_path,
    COUNT(*)::BIGINT AS event_count
  FROM public.analytics_events
  WHERE name = 'screen_view'
  GROUP BY 1
  ORDER BY event_count DESC;
$$;

-- RPC: total connections (profiles) per country.
CREATE OR REPLACE FUNCTION public.get_admin_connections_by_country()
RETURNS TABLE(country_code TEXT, connection_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT TRIM(UPPER(country))::TEXT AS country_code, COUNT(*)::BIGINT AS connection_count
  FROM public.profiles
  WHERE country IS NOT NULL AND TRIM(country) <> ''
  GROUP BY TRIM(UPPER(country))
  ORDER BY connection_count DESC;
$$;

-- RPC: UK only – connections per city (when city is set).
CREATE OR REPLACE FUNCTION public.get_admin_connections_by_uk_city()
RETURNS TABLE(city_name TEXT, connection_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(NULLIF(TRIM(city), ''), '(not set)')::TEXT AS city_name, COUNT(*)::BIGINT AS connection_count
  FROM public.profiles
  WHERE UPPER(TRIM(country)) = 'GB'
  GROUP BY COALESCE(NULLIF(TRIM(city), ''), '(not set)')
  ORDER BY connection_count DESC;
$$;
