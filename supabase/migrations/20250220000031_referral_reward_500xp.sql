-- Referral reward: grant 500 XP per 3 referrals, max 3 times (at 3, 6, and 9 signups).
-- grant_referral_reward_if_due: when referrer hits 3, 6, or 9 signups, add 500 XP and recalc level.

CREATE OR REPLACE FUNCTION public.grant_referral_reward_if_due(p_referrer_id UUID)
RETURNS VOID AS $$
DECLARE
  cnt INT;
  v_new_xp INT;
BEGIN
  SELECT COUNT(*)::INT INTO cnt FROM public.referral_signups WHERE referrer_id = p_referrer_id;
  IF cnt = 0 OR cnt % 3 != 0 THEN
    RETURN;
  END IF;
  -- Cap at 3 rewards: only at 3, 6, and 9 referrals
  IF cnt > 9 THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    xp = xp + 500,
    level = public.level_from_xp((xp + 500)::INT),
    updated_at = NOW()
  WHERE id = p_referrer_id
  RETURNING profiles.xp INTO v_new_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.grant_referral_reward_if_due(UUID) IS 'When referrer has 3, 6, or 9 referred signups (max 3 rewards), grants 500 XP and updates level.';
