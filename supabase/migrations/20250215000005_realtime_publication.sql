-- Enable Realtime (Postgres Changes) for 1v1 tables.
-- Idempotent: catches "already member of publication" (42710) and skips.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.matches_1v1;
EXCEPTION
  WHEN SQLSTATE '42710' THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.match_rounds;
EXCEPTION
  WHEN SQLSTATE '42710' THEN NULL;
END
$$;
