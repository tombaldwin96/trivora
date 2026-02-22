-- Unique referral code per user; track signups and grant 3 free months per 3 referrals

-- 1. Add referral_code to profiles (unique, one per user)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code) WHERE referral_code IS NOT NULL;

-- 2. Track who signed up using whose referral code (one row per referred user)
CREATE TABLE IF NOT EXISTS public.referral_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referred_user_id)
);

CREATE INDEX idx_referral_signups_referrer ON public.referral_signups(referrer_id);

-- 3. Generate a unique 8-char referral code (safe alphabet, no ambiguous chars)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
  attempts INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique referral code';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Grant 3 months to referrer when they hit 3, 6, 9... signups (called after inserting a referral_signups row)
CREATE OR REPLACE FUNCTION public.grant_referral_reward_if_due(p_referrer_id UUID)
RETURNS VOID AS $$
DECLARE
  cnt INT;
  sub RECORD;
  new_end TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*)::INT INTO cnt FROM public.referral_signups WHERE referrer_id = p_referrer_id;
  IF cnt = 0 OR cnt % 3 != 0 THEN
    RETURN;
  END IF;
  SELECT id, current_period_end, status INTO sub
  FROM public.subscriptions WHERE user_id = p_referrer_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  new_end := COALESCE(
    GREATEST(sub.current_period_end, NOW()),
    NOW()
  ) + (INTERVAL '3 months');
  UPDATE public.subscriptions
  SET current_period_end = new_end, status = 'active', updated_at = NOW()
  WHERE user_id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Apply referral when new user signs up with a code (from metadata or later via RPC)
CREATE OR REPLACE FUNCTION public.apply_referral(p_referral_code TEXT)
RETURNS JSONB AS $$
DECLARE
  v_referrer_id UUID;
  v_referred_id UUID;
  v_already BOOLEAN;
BEGIN
  p_referral_code := TRIM(UPPER(p_referral_code));
  IF p_referral_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Missing referral code');
  END IF;

  SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = p_referral_code LIMIT 1;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid referral code');
  END IF;

  v_referred_id := auth.uid();
  IF v_referred_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF v_referrer_id = v_referred_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot use your own code');
  END IF;

  INSERT INTO public.referral_signups (referrer_id, referred_user_id)
  VALUES (v_referrer_id, v_referred_id)
  ON CONFLICT (referred_user_id) DO NOTHING;

  IF FOUND THEN
    PERFORM public.grant_referral_reward_if_due(v_referrer_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'message', 'Referral applied');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update handle_new_user: set referral_code for new profile and process referral from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  i INT := 0;
  ref_code TEXT;
  referrer_id UUID;
BEGIN
  base_username := COALESCE(
    LOWER(REGEXP_REPLACE(NEW.raw_user_meta_data ->> 'name', '[^a-zA-Z0-9_]', '', 'g')),
    'user'
  );
  base_username := SUBSTRING(base_username FROM 1 FOR 20);
  IF LENGTH(base_username) < 3 THEN
    base_username := base_username || SUBSTRING(REPLACE(NEW.id::TEXT, '-', '') FROM 1 FOR 3);
  END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    i := i + 1;
    final_username := base_username || i::TEXT;
    IF LENGTH(final_username) > 24 THEN
      final_username := SUBSTRING(base_username FROM 1 FOR 24 - LENGTH(i::TEXT)) || i::TEXT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE id = NEW.id;

  INSERT INTO public.subscriptions (user_id, status, provider)
  VALUES (NEW.id, 'free', 'none');

  ref_code := TRIM(UPPER(NEW.raw_user_meta_data ->> 'referral_code'));
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT id INTO referrer_id FROM public.profiles WHERE referral_code = ref_code AND id != NEW.id LIMIT 1;
    IF referrer_id IS NOT NULL THEN
      INSERT INTO public.referral_signups (referrer_id, referred_user_id)
      VALUES (referrer_id, NEW.id)
      ON CONFLICT (referred_user_id) DO NOTHING;
      PERFORM public.grant_referral_reward_if_due(referrer_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Backfill referral_code for existing profiles that don't have one
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE referral_code IS NULL
  LOOP
    new_code := public.generate_referral_code();
    UPDATE public.profiles SET referral_code = new_code WHERE id = r.id;
  END LOOP;
END;
$$;

-- RLS for referral_signups (users can read their own as referrer or referred)
ALTER TABLE public.referral_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY referral_signups_select_own ON public.referral_signups
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);
