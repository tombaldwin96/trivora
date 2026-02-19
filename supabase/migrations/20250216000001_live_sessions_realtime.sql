-- Enable Realtime for live_sessions only (status, playback_url, started_at, ended_at).
-- NOT live_answers: too high volume when everyone submits at once; use Edge Function or poll for leaderboard.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
EXCEPTION
  WHEN SQLSTATE '42710' THEN NULL;
END
$$;
