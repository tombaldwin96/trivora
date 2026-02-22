-- Sync game start: both players see VS and 3,2,1 countdown at the same time, then quiz begins.
-- Host sets game_starts_at when creating rounds (4 seconds from then); clients use it to show countdown and start together.

ALTER TABLE public.matches_1v1
  ADD COLUMN IF NOT EXISTS game_starts_at TIMESTAMPTZ;

COMMENT ON COLUMN public.matches_1v1.game_starts_at IS 'When the sync countdown (3,2,1) starts; both clients use this to begin the quiz at the same time.';
