-- One marker per online user so the map shows a user icon above everyone who's online.
-- Returns (latitude, longitude) per user with a tiny random jitter so same-location users don't stack.

CREATE OR REPLACE FUNCTION public.get_online_user_locations_for_map(p_minutes INT DEFAULT 10)
RETURNS TABLE(
  latitude  DOUBLE PRECISION,
  longitude DOUBLE PRECISION
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH online AS (
    SELECT
      p.id,
      ROUND(COALESCE(p.latitude, c.latitude, 0)::numeric, 2)::double precision AS base_lat,
      ROUND(COALESCE(p.longitude, c.longitude, 0)::numeric, 2)::double precision AS base_lng
    FROM public.profiles p
    LEFT JOIN public.country_centroids c
      ON c.country_code = TRIM(UPPER(p.country))
    WHERE p.last_seen_at IS NOT NULL
      AND p.last_seen_at > (NOW() - (p_minutes || ' minutes')::INTERVAL)
  )
  SELECT
    (o.base_lat + ((md5(o.id::text)::bit(32)::bigint % 1000) / 1000.0 - 0.5) * 0.015)::double precision AS latitude,
    (o.base_lng + ((md5(o.id::text || 'x')::bit(32)::bigint % 1000) / 1000.0 - 0.5) * 0.015)::double precision AS longitude
  FROM online o;
$$;

COMMENT ON FUNCTION public.get_online_user_locations_for_map(INT) IS 'Returns one (lat, lng) per online user for map markers; deterministic jitter so same-area users spread slightly.';

GRANT EXECUTE ON FUNCTION public.get_online_user_locations_for_map(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_user_locations_for_map(INT) TO anon;
