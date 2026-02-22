-- Cinematic intro/outro: server-driven timestamps so both clients stay in sync.
-- Do NOT remove any existing columns.

ALTER TABLE public.matches_1v1
  ADD COLUMN IF NOT EXISTS intro_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS intro_duration_ms INT NOT NULL DEFAULT 7000,
  ADD COLUMN IF NOT EXISTS match_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outro_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outro_duration_ms INT NOT NULL DEFAULT 2500;

COMMENT ON COLUMN public.matches_1v1.intro_started_at IS 'When the pre-match intro cutscene started (server time).';
COMMENT ON COLUMN public.matches_1v1.intro_duration_ms IS 'Intro duration in ms; match_start_at = intro_started_at + this.';
COMMENT ON COLUMN public.matches_1v1.match_start_at IS 'When clients transition from intro to gameplay (server time).';
COMMENT ON COLUMN public.matches_1v1.outro_started_at IS 'When the post-match outro cutscene started (set on finalize).';
COMMENT ON COLUMN public.matches_1v1.outro_duration_ms IS 'Outro duration in ms.';
