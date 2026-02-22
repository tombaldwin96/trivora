-- Include all online users in map count; use generalised location when we can't get accurate one.
-- Before: users with no lat/lng and no known country were excluded. Now: everyone online is counted
-- and shown (coarse location → country centroid → fallback 0,0 so they still appear).

CREATE OR REPLACE FUNCTION public.get_online_users_for_map(p_minutes INT DEFAULT 10)
RETURNS TABLE(
  latitude  DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  user_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH online AS (
    SELECT
      p.id,
      p.latitude  AS p_lat,
      p.longitude AS p_lng,
      c.latitude  AS c_lat,
      c.longitude AS c_lng
    FROM public.profiles p
    LEFT JOIN public.country_centroids c
      ON c.country_code = TRIM(UPPER(p.country))
    WHERE p.last_seen_at IS NOT NULL
      AND p.last_seen_at > (NOW() - (p_minutes || ' minutes')::INTERVAL)
  ),
  buckets AS (
    SELECT
      ROUND(COALESCE(o.p_lat, o.c_lat, 0)::numeric, 2)::double precision AS lat,
      ROUND(COALESCE(o.p_lng, o.c_lng, 0)::numeric, 2)::double precision AS lng
    FROM online o
  )
  SELECT
    b.lat   AS latitude,
    b.lng   AS longitude,
    COUNT(*)::BIGINT AS user_count
  FROM buckets b
  GROUP BY b.lat, b.lng
  ORDER BY user_count DESC;
$$;

COMMENT ON FUNCTION public.get_online_users_for_map(INT) IS 'Returns (lat, lng, count) for map. All online users included: coarse location when set, else country centroid, else generalised (0,0).';
