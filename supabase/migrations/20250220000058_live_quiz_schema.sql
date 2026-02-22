-- Trivora Live Quiz system: sessions, state, answers, scores, leaderboard snapshot, audit.
-- Isolated from existing live_sessions/live_answers; clients subscribe to live_quiz_state only.

-- Enum for session status
DO $$ BEGIN
  CREATE TYPE live_quiz_session_status AS ENUM ('draft', 'scheduled', 'live', 'ended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enum for state phase
DO $$ BEGIN
  CREATE TYPE live_quiz_phase AS ENUM (
    'idle', 'countdown', 'open', 'locked', 'reveal', 'intermission', 'ended'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A) live_quiz_sessions
CREATE TABLE IF NOT EXISTS public.live_quiz_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL DEFAULT 'Live Quiz',
  status live_quiz_session_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_start_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_live_quiz_sessions_status ON public.live_quiz_sessions(status);
CREATE INDEX idx_live_quiz_sessions_created_by ON public.live_quiz_sessions(created_by);

-- B) live_quiz_session_questions (ordered question pack per session)
CREATE TABLE IF NOT EXISTS public.live_quiz_session_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  position INT NOT NULL,
  UNIQUE(session_id, position)
);

CREATE INDEX idx_live_quiz_session_questions_session ON public.live_quiz_session_questions(session_id);

-- C) live_quiz_state — ONE ROW PER SESSION (source of truth for realtime)
CREATE TABLE IF NOT EXISTS public.live_quiz_state (
  session_id UUID PRIMARY KEY REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  phase live_quiz_phase NOT NULL DEFAULT 'idle',
  countdown_ends_at TIMESTAMPTZ,
  current_question_index INT NOT NULL DEFAULT 0,
  question_started_at TIMESTAMPTZ,
  question_duration_ms INT NOT NULL DEFAULT 15000,
  reveal_started_at TIMESTAMPTZ,
  message TEXT,
  video_stream_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.live_quiz_state IS 'Single row per session; clients subscribe via Realtime. No per-answer stream.';

-- D) live_quiz_answers (writes only via Edge Function)
CREATE TABLE IF NOT EXISTS public.live_quiz_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer_index INT NOT NULL,
  elapsed_ms INT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  score_awarded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, question_id, user_id)
);

CREATE INDEX idx_live_quiz_answers_session ON public.live_quiz_answers(session_id);
CREATE INDEX idx_live_quiz_answers_session_user ON public.live_quiz_answers(session_id, user_id);

-- E) live_quiz_scores (aggregate per user per session)
CREATE TABLE IF NOT EXISTS public.live_quiz_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_score INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  answered_count INT NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX idx_live_quiz_scores_session_score ON public.live_quiz_scores(session_id, total_score DESC);

-- F) live_quiz_leaderboard_snapshot (updated every ~1s or on reveal; small payload)
CREATE TABLE IF NOT EXISTS public.live_quiz_leaderboard_snapshot (
  session_id UUID PRIMARY KEY REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  top_json JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.live_quiz_leaderboard_snapshot IS 'Top 10-25 entries; clients subscribe to this, not to answers.';

-- G) live_quiz_admin_actions (audit log)
CREATE TABLE IF NOT EXISTS public.live_quiz_admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.live_quiz_sessions(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'START', 'STOP', 'COUNTDOWN', 'NEXT', 'REVEAL', 'END', 'SET_VIDEO', 'SET_QUESTIONS'
  )),
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_live_quiz_admin_actions_session ON public.live_quiz_admin_actions(session_id);
CREATE INDEX idx_live_quiz_admin_actions_created ON public.live_quiz_admin_actions(created_at DESC);

-- Trigger: create live_quiz_state row when session is created
CREATE OR REPLACE FUNCTION public.live_quiz_session_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.live_quiz_state (session_id)
  VALUES (NEW.id)
  ON CONFLICT (session_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_quiz_session_created_trigger ON public.live_quiz_sessions;
CREATE TRIGGER live_quiz_session_created_trigger
  AFTER INSERT ON public.live_quiz_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.live_quiz_session_created();

-- updated_at trigger for live_quiz_sessions (set_updated_at exists in initial_schema)
DROP TRIGGER IF EXISTS live_quiz_sessions_updated_at ON public.live_quiz_sessions;
CREATE TRIGGER live_quiz_sessions_updated_at BEFORE UPDATE ON public.live_quiz_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.live_quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_leaderboard_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_quiz_admin_actions ENABLE ROW LEVEL SECURITY;

-- RLS: Players can read active/scheduled sessions
CREATE POLICY live_quiz_sessions_select_active ON public.live_quiz_sessions FOR SELECT
  USING (status IN ('scheduled', 'live', 'ended') OR public.is_admin());

-- Admins full access to sessions
CREATE POLICY live_quiz_sessions_admin ON public.live_quiz_sessions FOR ALL
  USING (public.is_admin());

-- Session questions: players can read for sessions they can see
CREATE POLICY live_quiz_session_questions_select ON public.live_quiz_session_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('scheduled', 'live', 'ended') OR public.is_admin())
    )
  );
CREATE POLICY live_quiz_session_questions_admin ON public.live_quiz_session_questions FOR ALL
  USING (public.is_admin());

-- State: players read; only server/edge updates (no direct client insert/update from app)
CREATE POLICY live_quiz_state_select ON public.live_quiz_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('scheduled', 'live', 'ended') OR public.is_admin())
    )
  );
CREATE POLICY live_quiz_state_admin ON public.live_quiz_state FOR ALL
  USING (public.is_admin());

-- Answers: no direct insert from client (Edge Function uses service role or SECURITY DEFINER)
CREATE POLICY live_quiz_answers_select_own ON public.live_quiz_answers FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
-- No INSERT/UPDATE for authenticated (only via Edge Function)

-- Scores: players can read (for leaderboard)
CREATE POLICY live_quiz_scores_select ON public.live_quiz_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('scheduled', 'live', 'ended') OR public.is_admin())
    )
  );
CREATE POLICY live_quiz_scores_admin ON public.live_quiz_scores FOR ALL
  USING (public.is_admin());

-- Leaderboard snapshot: players read
CREATE POLICY live_quiz_leaderboard_snapshot_select ON public.live_quiz_leaderboard_snapshot FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('scheduled', 'live', 'ended') OR public.is_admin())
    )
  );
CREATE POLICY live_quiz_leaderboard_snapshot_admin ON public.live_quiz_leaderboard_snapshot FOR ALL
  USING (public.is_admin());

-- Admin actions: admin read only
CREATE POLICY live_quiz_admin_actions_select ON public.live_quiz_admin_actions FOR SELECT
  USING (public.is_admin());
CREATE POLICY live_quiz_admin_actions_insert ON public.live_quiz_admin_actions FOR INSERT
  WITH CHECK (public.is_admin());

-- Realtime: enable for state and leaderboard snapshot only (not answers)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_quiz_state;
EXCEPTION WHEN SQLSTATE '42710' THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_quiz_leaderboard_snapshot;
EXCEPTION WHEN SQLSTATE '42710' THEN NULL;
END $$;

-- Grant execute for RPCs used by edge functions (service_role has full access; anon/authenticated need read)
GRANT SELECT ON public.live_quiz_sessions TO authenticated;
GRANT SELECT ON public.live_quiz_session_questions TO authenticated;
GRANT SELECT ON public.live_quiz_state TO authenticated;
GRANT SELECT ON public.live_quiz_leaderboard_snapshot TO authenticated;
GRANT SELECT ON public.live_quiz_answers TO authenticated;
GRANT SELECT ON public.live_quiz_scores TO authenticated;
