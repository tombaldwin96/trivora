-- Tiered XP: levels 1-50 = 50 XP each, 51-75 = 75, 76-99 = 90, 100+ = 100.
-- Matches apps/mobile/lib/xp-context.tsx (xpForLevel / levelFromXp).

CREATE OR REPLACE FUNCTION public.level_from_xp(p_xp INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_xp IS NULL OR p_xp < 0 THEN 1
    WHEN p_xp < 2450 THEN GREATEST(1, 1 + (p_xp / 50))
    WHEN p_xp < 4325 THEN 50 + ((p_xp - 2450) / 75)
    WHEN p_xp < 6485 THEN 75 + ((p_xp - 4325) / 90)
    ELSE 99 + ((p_xp - 6485) / 100)
  END::INT;
$$;

COMMENT ON FUNCTION public.level_from_xp(INT) IS 'Level from total XP using tiered curve: 50 XP/lvl 1-50, 75 for 51-75, 90 for 76-99, 100 for 100+.';

-- Update add_xp to use tiered level
CREATE OR REPLACE FUNCTION public.add_xp(p_points INT)
RETURNS TABLE(new_xp INT, new_level INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
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
    level = public.level_from_xp((xp + p_points)::INT),
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
