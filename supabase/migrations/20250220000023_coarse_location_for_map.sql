-- Coarse location (rounded lat/lng) so map shows users near their real area (e.g. Liverpool not London).
-- Opt-in: app sends device location rounded to 2 decimals (~1 km); fallback remains country centroid.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.profiles.latitude  IS 'Rounded device location (2 decimals) for map; opt-in.';
COMMENT ON COLUMN public.profiles.longitude IS 'Rounded device location (2 decimals) for map; opt-in.';

-- Country centroids for fallback when user has no lat/lng (same as app).
CREATE TABLE IF NOT EXISTS public.country_centroids (
  country_code TEXT PRIMARY KEY,
  latitude  DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL
);

INSERT INTO public.country_centroids (country_code, latitude, longitude) VALUES
  ('US', 38.5, -92.0),
  ('GB', 51.5074, -0.1278),
  ('CA', 43.65, -79.38),
  ('AU', -33.87, 151.21),
  ('DE', 50.1, 8.7),
  ('FR', 48.86, 2.35),
  ('ES', 40.42, -3.7),
  ('IT', 41.9, 12.5),
  ('NL', 52.37, 4.89),
  ('IN', 19.08, 72.88),
  ('BR', -23.55, -46.63),
  ('MX', 19.43, -99.13),
  ('JP', 35.68, 139.65),
  ('KR', 37.57, 126.98),
  ('CN', 31.23, 121.47),
  ('IE', 53.3498, -6.2603),
  ('NZ', -36.85, 174.76),
  ('ZA', -26.2, 28.04),
  ('SE', 59.33, 18.07),
  ('NO', 59.91, 10.75),
  ('DK', 55.68, 12.57),
  ('FI', 60.17, 24.94),
  ('PL', 52.23, 21.01),
  ('PT', 38.72, -9.14),
  ('BE', 50.85, 4.35),
  ('AT', 48.21, 16.37),
  ('CH', 47.38, 8.54),
  ('AR', -34.6, -58.38),
  ('CO', 4.71, -74.07),
  ('CL', -33.45, -70.67),
  ('PH', 14.6, 120.98),
  ('SG', 1.35, 103.82),
  ('MY', 3.14, 101.69),
  ('AE', 25.2, 55.27),
  ('SA', 24.71, 46.68),
  ('EG', 30.04, 31.24),
  ('NG', 6.45, 3.39),
  ('KE', -1.29, 36.82),
  ('GH', 5.6, -0.19),
  ('IL', 32.08, 34.78),
  ('TR', 41.01, 28.95),
  ('RU', 55.75, 37.62),
  ('UA', 50.45, 30.52),
  ('GR', 37.98, 23.73),
  ('RO', 44.43, 26.1),
  ('CZ', 50.08, 14.44),
  ('HU', 47.5, 19.04),
  ('TH', 13.75, 100.5),
  ('VN', 21.03, 105.85),
  ('ID', -6.21, 106.85),
  ('PK', 24.86, 67.01),
  ('BD', 23.81, 90.41)
ON CONFLICT (country_code) DO UPDATE SET
  latitude  = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude;

-- Heartbeat: update last_seen_at and optionally store coarse location (rounded to 2 decimals).
CREATE OR REPLACE FUNCTION public.update_last_seen(
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    last_seen_at = NOW(),
    updated_at   = NOW(),
    latitude     = CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN ROUND(p_lat::numeric, 2)::double precision ELSE latitude END,
    longitude    = CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN ROUND(p_lng::numeric, 2)::double precision ELSE longitude END
  WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.update_last_seen(DOUBLE PRECISION, DOUBLE PRECISION) IS 'Heartbeat: sets last_seen_at; optionally updates coarse lat/lng (rounded to 2 decimals) for map.';

-- Map data: one row per (lat, lng) bucket with user count. Uses profile lat/lng when set, else country centroid.
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
      p.country,
      p.latitude  AS p_lat,
      p.longitude AS p_lng,
      c.latitude  AS c_lat,
      c.longitude AS c_lng
    FROM public.profiles p
    LEFT JOIN public.country_centroids c
      ON c.country_code = TRIM(UPPER(p.country))
    WHERE p.last_seen_at IS NOT NULL
      AND p.last_seen_at > (NOW() - (p_minutes || ' minutes')::INTERVAL)
      AND (
        (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)
        OR (p.country IS NOT NULL AND TRIM(p.country) <> '' AND c.country_code IS NOT NULL)
      )
  ),
  buckets AS (
    SELECT
      ROUND(COALESCE(o.p_lat, o.c_lat)::numeric, 2)::double precision AS lat,
      ROUND(COALESCE(o.p_lng, o.c_lng)::numeric, 2)::double precision AS lng
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

COMMENT ON FUNCTION public.get_online_users_for_map(INT) IS 'Returns (lat, lng, count) for map markers; uses coarse location when set, else country centroid.';
