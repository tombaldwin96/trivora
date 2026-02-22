-- One-off: remove today's daily quiz attempt(s) for sammibreeze so they can play again.
DELETE FROM public.attempts a
USING public.profiles p
WHERE a.user_id = p.id
  AND p.username = 'sammibreeze'
  AND a.quiz_id IN (
    SELECT id FROM public.quizzes
    WHERE type = 'daily' AND status = 'published'
  )
  AND a.started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
