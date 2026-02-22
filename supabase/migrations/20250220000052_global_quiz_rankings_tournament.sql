-- The Trivora Global Quiz Rankings: championship tournament schema
-- Extends existing tournaments; adds registrations, rounds, matches, honours.

-- 1) Extend tournaments for global/national championship
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('global', 'national')),
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS entry_fee_pence INT,
  ADD COLUMN IF NOT EXISTS prize_pence INT,
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS location_country TEXT,
  ADD COLUMN IF NOT EXISTS finals_venue_name TEXT,
  ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS games_begin_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finals_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finals_time_window TEXT,
  ADD COLUMN IF NOT EXISTS awards_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finals_top_n INT;

COMMENT ON COLUMN public.tournaments.type IS 'global = paid annual; national = free, 4 per year';
COMMENT ON COLUMN public.tournaments.entry_fee_pence IS '500 = £5';
COMMENT ON COLUMN public.tournaments.finals_top_n IS '16 = top 16 go to live finals';

-- Allow new status values (keep existing draft/published/live/ended; add championship lifecycle)
-- status remains TEXT; use 'upcoming' | 'registration_open' | 'in_progress' | 'finals' | 'completed' for championship

-- 2) Tournament registrations (payment, one per user per tournament)
CREATE TABLE IF NOT EXISTS public.tournament_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  payment_provider TEXT CHECK (payment_provider IN ('apple', 'google', 'stripe', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX idx_tournament_registrations_tournament ON public.tournament_registrations(tournament_id);
CREATE INDEX idx_tournament_registrations_user ON public.tournament_registrations(user_id);

COMMENT ON TABLE public.tournament_registrations IS 'Championship registrations; payment verified server-side only';

-- 3) Tournament rounds (Round of 256, 128, … 16)
CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  label TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, round_number)
);

CREATE INDEX idx_tournament_rounds_tournament ON public.tournament_rounds(tournament_id);

-- 4) Tournament matches (bracket matches)
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player_a_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  player_b_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'forfeit')),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  winner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  player_a_score INT DEFAULT 0,
  player_b_score INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tournament_matches_tournament ON public.tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_round ON public.tournament_matches(tournament_id, round_number);
CREATE INDEX idx_tournament_matches_players ON public.tournament_matches(player_a_id, player_b_id);

-- 5) Tournament honours (winners, runners-up, finalists)
CREATE TABLE IF NOT EXISTS public.tournament_honours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  placement INT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tournament_honours_tournament ON public.tournament_honours(tournament_id);

-- 6) RLS
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_honours ENABLE ROW LEVEL SECURITY;

-- tournaments: everyone can read; only admin can insert/update/delete
DROP POLICY IF EXISTS tournaments_select ON public.tournaments;
CREATE POLICY tournaments_select ON public.tournaments FOR SELECT USING (TRUE);
-- keep tournaments_admin for write
DROP POLICY IF EXISTS tournaments_admin ON public.tournaments;
CREATE POLICY tournaments_admin ON public.tournaments FOR ALL USING (public.is_admin());

-- tournament_registrations: users read own; users insert own (registration); payment_status update server-side only
CREATE POLICY tournament_registrations_select ON public.tournament_registrations FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY tournament_registrations_insert ON public.tournament_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY tournament_registrations_admin ON public.tournament_registrations FOR UPDATE
  USING (public.is_admin());
CREATE POLICY tournament_registrations_admin_delete ON public.tournament_registrations FOR DELETE
  USING (public.is_admin());

-- tournament_rounds: public read; admin write
CREATE POLICY tournament_rounds_select ON public.tournament_rounds FOR SELECT USING (TRUE);
CREATE POLICY tournament_rounds_admin ON public.tournament_rounds FOR ALL USING (public.is_admin());

-- tournament_matches: public read; admin write (scoring server-authoritative)
CREATE POLICY tournament_matches_select ON public.tournament_matches FOR SELECT USING (TRUE);
CREATE POLICY tournament_matches_admin ON public.tournament_matches FOR ALL USING (public.is_admin());

-- tournament_honours: public read; admin write
CREATE POLICY tournament_honours_select ON public.tournament_honours FOR SELECT USING (TRUE);
CREATE POLICY tournament_honours_admin ON public.tournament_honours FOR ALL USING (public.is_admin());

GRANT SELECT ON public.tournaments TO anon, authenticated;
GRANT SELECT, INSERT ON public.tournament_registrations TO authenticated;
GRANT ALL ON public.tournament_registrations TO service_role;
GRANT SELECT ON public.tournament_rounds TO anon, authenticated;
GRANT SELECT ON public.tournament_matches TO anon, authenticated;
GRANT SELECT ON public.tournament_honours TO anon, authenticated;
