-- RLS: enable on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches_1v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Helper: is admin (custom claim or profile.is_admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- profiles: public read (limited), own full
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (TRUE);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- subscriptions: own read; service role / webhooks write
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY subscriptions_insert ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY subscriptions_update ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- categories: public read active
CREATE POLICY categories_select ON public.categories FOR SELECT
  USING (is_active = TRUE OR public.is_admin());
CREATE POLICY categories_admin ON public.categories FOR ALL
  USING (public.is_admin());

-- questions: public read active, admin write
CREATE POLICY questions_select ON public.questions FOR SELECT
  USING (is_active = TRUE OR public.is_admin());
CREATE POLICY questions_admin ON public.questions FOR ALL
  USING (public.is_admin());

-- quizzes: read published or admin
CREATE POLICY quizzes_select ON public.quizzes FOR SELECT
  USING (status = 'published' OR public.is_admin());
CREATE POLICY quizzes_admin ON public.quizzes FOR ALL
  USING (public.is_admin());

-- quiz_questions: same as quizzes
CREATE POLICY quiz_questions_select ON public.quiz_questions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND (q.status = 'published' OR public.is_admin()))
  );
CREATE POLICY quiz_questions_admin ON public.quiz_questions FOR ALL
  USING (public.is_admin());

-- attempts: own only
CREATE POLICY attempts_select ON public.attempts FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY attempts_insert ON public.attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY attempts_update ON public.attempts FOR UPDATE
  USING (auth.uid() = user_id);

-- seasons: public read
CREATE POLICY seasons_select ON public.seasons FOR SELECT
  USING (TRUE);
CREATE POLICY seasons_admin ON public.seasons FOR ALL
  USING (public.is_admin());

-- matches_1v1: participants or admin
CREATE POLICY matches_select ON public.matches_1v1 FOR SELECT
  USING (player_a = auth.uid() OR player_b = auth.uid() OR public.is_admin());
CREATE POLICY matches_insert ON public.matches_1v1 FOR INSERT
  WITH CHECK (public.is_admin() OR player_a = auth.uid() OR player_b = auth.uid());
CREATE POLICY matches_update ON public.matches_1v1 FOR UPDATE
  USING (player_a = auth.uid() OR player_b = auth.uid() OR public.is_admin());

-- match_rounds: via match
CREATE POLICY match_rounds_select ON public.match_rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches_1v1 m
      WHERE m.id = match_id AND (m.player_a = auth.uid() OR m.player_b = auth.uid() OR public.is_admin())
    )
  );
CREATE POLICY match_rounds_admin ON public.match_rounds FOR ALL
  USING (public.is_admin());

-- standings: public read (leaderboards)
CREATE POLICY standings_select ON public.standings FOR SELECT
  USING (TRUE);
CREATE POLICY standings_insert ON public.standings FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY standings_update ON public.standings FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

-- invites: from_user or to_user
CREATE POLICY invites_select ON public.invites FOR SELECT
  USING (from_user = auth.uid() OR to_user = auth.uid());
CREATE POLICY invites_insert ON public.invites FOR INSERT
  WITH CHECK (from_user = auth.uid());
CREATE POLICY invites_update ON public.invites FOR UPDATE
  USING (from_user = auth.uid() OR to_user = auth.uid());

-- teams: read all, write owner/member
CREATE POLICY teams_select ON public.teams FOR SELECT
  USING (TRUE);
CREATE POLICY teams_insert ON public.teams FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY teams_update ON public.teams FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin());

-- team_members: team members can read, owner can manage
CREATE POLICY team_members_select ON public.team_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id)
  );
CREATE POLICY team_members_insert ON public.team_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY team_members_update ON public.team_members FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );
CREATE POLICY team_members_delete ON public.team_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

-- tournaments: read published, admin write
CREATE POLICY tournaments_select ON public.tournaments FOR SELECT
  USING (status IN ('published', 'live', 'ended') OR public.is_admin());
CREATE POLICY tournaments_admin ON public.tournaments FOR ALL
  USING (public.is_admin());

-- tournament_entries: own or admin
CREATE POLICY tournament_entries_select ON public.tournament_entries FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY tournament_entries_insert ON public.tournament_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- live_sessions: read when live/scheduled, admin write
CREATE POLICY live_sessions_select ON public.live_sessions FOR SELECT
  USING (status IN ('scheduled', 'live', 'ended') OR public.is_admin());
CREATE POLICY live_sessions_admin ON public.live_sessions FOR ALL
  USING (public.is_admin());

-- live_answers: insert own, read via session
CREATE POLICY live_answers_select ON public.live_answers FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY live_answers_insert ON public.live_answers FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- reports: reporter or admin
CREATE POLICY reports_select ON public.reports FOR SELECT
  USING (reporter_id = auth.uid() OR public.is_admin());
CREATE POLICY reports_insert ON public.reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_update ON public.reports FOR UPDATE
  USING (public.is_admin());

-- audit_logs: admin only
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT
  USING (public.is_admin());

-- push_tokens: own only
CREATE POLICY push_tokens_all ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id);

-- analytics_events: insert own, read admin only (or service)
CREATE POLICY analytics_events_insert ON public.analytics_events FOR INSERT
  WITH CHECK (TRUE);
CREATE POLICY analytics_events_select ON public.analytics_events FOR SELECT
  USING (public.is_admin());

-- leaderboard_daily: public read
CREATE POLICY leaderboard_daily_select ON public.leaderboard_daily FOR SELECT
  USING (TRUE);
CREATE POLICY leaderboard_daily_admin ON public.leaderboard_daily FOR ALL
  USING (public.is_admin());

-- friends: own only
CREATE POLICY friends_select ON public.friends FOR SELECT
  USING (user_id = auth.uid() OR friend_id = auth.uid());
CREATE POLICY friends_insert ON public.friends FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY friends_delete ON public.friends FOR DELETE
  USING (user_id = auth.uid() OR friend_id = auth.uid());
