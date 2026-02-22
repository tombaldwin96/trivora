-- Ensure at least one 1v1 division 5 season exists so quick match and ensure_user_standing work.
-- Without this, matchmaking fails with "No active season" if seed.sql was not run.
INSERT INTO public.seasons (id, mode, division, season_number, starts_at, ends_at)
SELECT
  'c0000000-0000-0000-0000-000000000005',
  '1v1',
  5,
  1,
  '2025-01-01T00:00:00Z',
  '2025-12-31T23:59:59Z'
WHERE NOT EXISTS (
  SELECT 1 FROM public.seasons
  WHERE mode = '1v1' AND division = 5
);
