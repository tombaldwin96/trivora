-- When set, viewers' apps play the Mahan sweep animation (admin triggers via Mahan button).
ALTER TABLE public.live_quiz_state
  ADD COLUMN IF NOT EXISTS mahan_sweep_at TIMESTAMPTZ;

COMMENT ON COLUMN public.live_quiz_state.mahan_sweep_at IS 'When set, viewers see Mahan sweep on their app; admin sets via Mahan button.';
