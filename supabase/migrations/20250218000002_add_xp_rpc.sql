-- Atomic XP add: prevents race conditions and ensures leaderboard shows correct value.
-- Call as: select * from add_xp(25);
CREATE OR REPLACE FUNCTION public.add_xp(p_points INT)
RETURNS TABLE(new_xp INT, new_level INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_xp INT;
  v_new_xp INT;
  v_new_level INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    xp = xp + p_points,
    level = GREATEST(1, FLOOR((xp + p_points) / 50) + 1),
    updated_at = NOW()
  WHERE id = v_user_id
  RETURNING profiles.xp, profiles.level INTO v_new_xp, v_new_level;

  IF v_new_xp IS NOT NULL THEN
    new_xp := v_new_xp;
    new_level := v_new_level;
    RETURN NEXT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_xp(INT) TO authenticated;
