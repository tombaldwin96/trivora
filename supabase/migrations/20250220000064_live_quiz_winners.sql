-- When a live quiz ends, rank 1 is the winner. Record each win for display (star + count).
CREATE TABLE IF NOT EXISTS public.live_quiz_winners (
  session_id UUID PRIMARY KEY REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.live_quiz_winners IS 'One row per session: the user who was rank 1 when the quiz ended.';

-- Win count on profile for display (username ★n)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS live_quiz_win_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.live_quiz_win_count IS 'Number of live quiz sessions this user won (rank 1 when quiz ended). Shown as ★n after username.';

CREATE INDEX IF NOT EXISTS idx_live_quiz_winners_user ON public.live_quiz_winners(user_id);

ALTER TABLE public.live_quiz_winners ENABLE ROW LEVEL SECURITY;

-- Only server/edge writes; anyone can read (for leaderboard display)
DROP POLICY IF EXISTS live_quiz_winners_select ON public.live_quiz_winners;
CREATE POLICY live_quiz_winners_select ON public.live_quiz_winners FOR SELECT
  USING (true);

DROP POLICY IF EXISTS live_quiz_winners_admin ON public.live_quiz_winners;
CREATE POLICY live_quiz_winners_admin ON public.live_quiz_winners FOR ALL
  USING (public.is_admin());

-- Service role can insert (edge function uses service key)
GRANT SELECT ON public.live_quiz_winners TO authenticated;
GRANT INSERT, UPDATE ON public.live_quiz_winners TO service_role;

-- Atomic increment for winner (called by edge function)
CREATE OR REPLACE FUNCTION public.increment_live_quiz_win_count(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET live_quiz_win_count = live_quiz_win_count + 1 WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_live_quiz_win_count(UUID) TO service_role;
