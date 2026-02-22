-- One-off: remove today's daily quiz attempt for tombaldwin1996@hotmail.co.uk so they can play again.
DELETE FROM public.attempts a
USING auth.users u
WHERE a.user_id = u.id
  AND u.email = 'tombaldwin1996@hotmail.co.uk'
  AND a.quiz_id = (
    SELECT id FROM public.quizzes
    WHERE type = 'daily' AND status = 'published'
    LIMIT 1
  )
  AND a.started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
