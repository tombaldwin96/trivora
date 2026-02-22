-- One-off: remove daily quiz attempt(s) for tom baldwin so they can play again.
-- Matches by username (tombaldwin, tombaldwin1996, etc.) and clears last 2 days UTC so timezone matches app.
DELETE FROM public.attempts a
USING public.profiles p
WHERE a.user_id = p.id
  AND (p.username ILIKE '%tombaldwin%' OR p.display_name ILIKE '%tom baldwin%')
  AND a.quiz_id IN (
    SELECT id FROM public.quizzes
    WHERE type = 'daily' AND status = 'published'
  )
  AND a.started_at >= (now() AT TIME ZONE 'UTC')::date - interval '2 days';
