-- Create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  i INT := 0;
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

  INSERT INTO public.subscriptions (user_id, status, provider)
  VALUES (NEW.id, 'free', 'none');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Realtime: broadcast for matches and live sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches_1v1;
-- live_answers can be heavy; optionally use Edge Function fanout instead
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.live_answers;
