-- Ensure user has a standing for matchmaking (default: division 5, current season).
-- start-matchmaking requires season_id from standings; new users have no standing until now.

CREATE OR REPLACE FUNCTION public.ensure_user_standing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  sid UUID;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.standings WHERE user_id = uid) THEN
    RETURN;
  END IF;

  SELECT id INTO sid
  FROM public.seasons
  WHERE mode = '1v1' AND division = 5
  ORDER BY ends_at DESC
  LIMIT 1;

  IF sid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.standings (user_id, season_id, division, points, games_played, wins, draws, losses, mmr)
  VALUES (uid, sid, 5, 0, 0, 0, 0, 0, 1000);

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_standing() TO authenticated;
