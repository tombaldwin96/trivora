-- Kicked users per session: admin can kick from leaderboard; they cannot submit answers.
CREATE TABLE IF NOT EXISTS public.live_quiz_kicked (
  session_id UUID NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kicked_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_live_quiz_kicked_session ON public.live_quiz_kicked(session_id);

ALTER TABLE public.live_quiz_kicked ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_quiz_kicked_admin ON public.live_quiz_kicked FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, DELETE ON public.live_quiz_kicked TO authenticated;
