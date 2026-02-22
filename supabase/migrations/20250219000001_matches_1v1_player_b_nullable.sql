-- Allow player_b to be NULL for quick matchmaking: first user gets a match slot,
-- second user is assigned when they click Quick match.
ALTER TABLE public.matches_1v1
  ALTER COLUMN player_b DROP NOT NULL;

COMMENT ON COLUMN public.matches_1v1.player_b IS 'Set when opponent joins via Quick match; NULL while waiting.';
