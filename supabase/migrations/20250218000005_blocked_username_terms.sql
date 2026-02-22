-- Block offensive/abusive terms in usernames. Any username containing (case-insensitive)
-- one of these terms will be rejected on INSERT/UPDATE of profiles.username.

CREATE TABLE IF NOT EXISTS public.blocked_username_terms (
  term TEXT PRIMARY KEY
);

COMMENT ON TABLE public.blocked_username_terms IS 'Terms that cannot appear in usernames (substring match, case-insensitive). Add terms in lowercase.';

-- Seed with a starter blocklist. Admins can INSERT more via SQL or a future admin UI.
INSERT INTO public.blocked_username_terms (term) VALUES
  ('fuck'), ('shit'), ('ass'), ('bitch'), ('dick'), ('cunt'), ('cock'), ('pussy'), ('whore'), ('slut'),
  ('nigger'), ('nigga'), ('faggot'), ('fag '), ('retard'), ('rape'), ('rapist'), ('nazi'), ('hitler'),
  ('kys'), ('kill yourself'), ('die ')
ON CONFLICT (term) DO NOTHING;

-- Only admins can manage the blocklist (RLS below).
ALTER TABLE public.blocked_username_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY blocked_terms_select ON public.blocked_username_terms FOR SELECT
  TO authenticated USING (true);

CREATE POLICY blocked_terms_admin ON public.blocked_username_terms FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- Reject username if it contains any blocked term (as substring).
CREATE OR REPLACE FUNCTION public.check_username_blocklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lower_username TEXT := LOWER(COALESCE(NEW.username, ''));
  blocked_term TEXT;
BEGIN
  IF lower_username = '' THEN
    RETURN NEW;
  END IF;
  FOR blocked_term IN SELECT term FROM public.blocked_username_terms
  LOOP
    IF position(blocked_term IN lower_username) > 0 THEN
      RAISE EXCEPTION 'username_not_allowed' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_username_blocklist_trigger ON public.profiles;
CREATE TRIGGER check_username_blocklist_trigger
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.check_username_blocklist();
