-- One-off: give every existing profile a unique random two-word + 2-digit username (pool >1.6M).
-- Self-contained (no dependency on generate_default_username from 00008).

DO $$
DECLARE
  r RECORD;
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
  new_username TEXT;
  suffix TEXT;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    LOOP
      w1 := words_1[1 + (random() * array_length(words_1, 1))::INT];
      w2 := words_2[1 + (random() * array_length(words_2, 1))::INT];
      suffix := LPAD((random() * 100)::INT::TEXT, 2, '0');
      new_username := w1 || w2 || suffix;
      IF LENGTH(new_username) > 24 THEN
        new_username := SUBSTRING(w1 || w2 FROM 1 FOR 22) || suffix;
      END IF;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = new_username);
    END LOOP;
    UPDATE public.profiles SET username = new_username WHERE id = r.id;
  END LOOP;
END $$;
