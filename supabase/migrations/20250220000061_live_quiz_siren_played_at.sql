-- Allow admin to trigger siren in app by updating this timestamp; app subscribes to live_quiz_state and plays when it changes.
ALTER TABLE public.live_quiz_state
  ADD COLUMN IF NOT EXISTS siren_played_at TIMESTAMPTZ;

COMMENT ON COLUMN public.live_quiz_state.siren_played_at IS 'Set by admin to trigger siren sound in app (Realtime).';
