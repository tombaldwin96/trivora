-- Allow app to read draft live_quiz sessions (and state/questions/snapshot/scores)
-- so users can open and test a session before it goes live.

DROP POLICY IF EXISTS live_quiz_sessions_select_active ON public.live_quiz_sessions;
CREATE POLICY live_quiz_sessions_select_active ON public.live_quiz_sessions FOR SELECT
  USING (status IN ('draft', 'scheduled', 'live', 'ended') OR public.is_admin());

DROP POLICY IF EXISTS live_quiz_session_questions_select ON public.live_quiz_session_questions;
CREATE POLICY live_quiz_session_questions_select ON public.live_quiz_session_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('draft', 'scheduled', 'live', 'ended') OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS live_quiz_state_select ON public.live_quiz_state;
CREATE POLICY live_quiz_state_select ON public.live_quiz_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('draft', 'scheduled', 'live', 'ended') OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS live_quiz_scores_select ON public.live_quiz_scores;
CREATE POLICY live_quiz_scores_select ON public.live_quiz_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('draft', 'scheduled', 'live', 'ended') OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS live_quiz_leaderboard_snapshot_select ON public.live_quiz_leaderboard_snapshot;
CREATE POLICY live_quiz_leaderboard_snapshot_select ON public.live_quiz_leaderboard_snapshot FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_quiz_sessions s
      WHERE s.id = session_id AND (s.status IN ('draft', 'scheduled', 'live', 'ended') OR public.is_admin())
    )
  );
