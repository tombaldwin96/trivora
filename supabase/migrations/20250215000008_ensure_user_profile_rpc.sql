-- Ensure every signed-in user has a profile with a default username (first-login fallback).
-- The trigger on auth.users already creates the profile on signup; this RPC fixes edge cases
-- (e.g. trigger failed, legacy user). Idempotent: no-op if profile already exists.

CREATE OR REPLACE FUNCTION public.generate_default_username()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  words_1 TEXT[] := ARRAY[
    'Swift', 'Calm', 'Bold', 'Bright', 'Clear', 'Cool', 'Fair', 'Gentle', 'Happy',
    'Kind', 'Lucky', 'Noble', 'Quick', 'Silent', 'True', 'Warm', 'Wise', 'Brave',
    'Cozy', 'Dawn', 'Echo', 'Frost', 'Glow', 'Haze', 'Ivy', 'Jade', 'Mint', 'Nova',
    'Peach', 'Quill', 'Rust', 'Sky', 'Tide', 'Umber', 'Vale', 'Wave', 'Zen'
  ];
  words_2 TEXT[] := ARRAY[
    'River', 'Mountain', 'Forest', 'Meadow', 'Valley', 'Cloud', 'Star', 'Stone',
    'Pine', 'Lake', 'Brook', 'Cliff', 'Grove', 'Hills', 'Storm', 'Flame', 'Frost',
    'Shadow', 'Light', 'Wind', 'Snow', 'Rain', 'Dust', 'Leaf', 'Mist', 'Dawn',
    'Dusk', 'Moon', 'Sun', 'Path', 'Trail', 'Peak', 'Reef', 'Cove', 'Field', 'Dune',
    'Pond', 'Creek', 'Ridge', 'Blade', 'Lane', 'Gate', 'Well', 'Oak', 'Elm'
  ];
  w1 TEXT;
  w2 TEXT;
  final_username TEXT;
  suffix TEXT;
BEGIN
  LOOP
    w1 := words_1[1 + (random() * array_length(words_1, 1))::INT];
    w2 := words_2[1 + (random() * array_length(words_2, 1))::INT];
    suffix := LPAD((random() * 100)::INT::TEXT, 2, '0');
    final_username := w1 || w2 || suffix;
    IF LENGTH(final_username) > 24 THEN
      final_username := SUBSTRING(w1 || w2 FROM 1 FOR 22) || suffix;
    END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username);
  END LOOP;

  RETURN final_username;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  meta JSONB;
  disp_name TEXT;
  av_url TEXT;
  new_username TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RETURN;
  END IF;

  new_username := public.generate_default_username();

  SELECT raw_user_meta_data INTO meta FROM auth.users WHERE id = uid;
  disp_name := COALESCE(meta ->> 'name', (SELECT email FROM auth.users WHERE id = uid));
  av_url := meta ->> 'avatar_url';

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (uid, new_username, disp_name, av_url);

  INSERT INTO public.subscriptions (user_id, status, provider)
  VALUES (uid, 'free', 'none');

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
