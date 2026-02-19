-- Default username: two random words + 2-digit suffix (e.g. SwiftMountain42) — pool >1.6M for 1M+ users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  INSERT INTO public.subscriptions (user_id, status, provider)
  VALUES (NEW.id, 'free', 'none');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
