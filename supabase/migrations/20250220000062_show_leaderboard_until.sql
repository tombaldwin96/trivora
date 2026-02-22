-- When set, the app shows full-screen leaderboard until this time (or until admin clears).
ALTER TABLE public.live_quiz_state
  ADD COLUMN IF NOT EXISTS show_leaderboard_until TIMESTAMPTZ;

COMMENT ON COLUMN public.live_quiz_state.show_leaderboard_until IS 'When set (future), app shows full-screen standings until this time or until cleared. Admin sets via Show standings.';
