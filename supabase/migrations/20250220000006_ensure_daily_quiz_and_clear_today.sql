-- Ensure a published daily quiz exists (fixes "No daily quiz available").
-- Clear today's attempts for that quiz so anyone (including tombaldwin1996) can do it.

-- 1) Ensure daily quiz row exists
INSERT INTO public.quizzes (id, type, title, description, status)
SELECT
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'daily'::public.quiz_type,
  'Daily Quiz',
  'Today''s 10 questions',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.quizzes
  WHERE type = 'daily' AND status = 'published'
);

-- 2) Delete today's attempts for the daily quiz (so you and tombaldwin1996 can do it again)
DELETE FROM public.attempts
WHERE quiz_id = (
  SELECT id FROM public.quizzes
  WHERE type = 'daily' AND status = 'published'
  LIMIT 1
)
AND started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
