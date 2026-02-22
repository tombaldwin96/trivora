-- Run this in Supabase SQL Editor to verify the last 3 migrations applied successfully.
-- Expected: all checks should return true or a count > 0.

-- ========== 1. Profile stats (20250218000004) ==========
SELECT
  '1. profiles has total_quizzes_taken' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_quizzes_taken'
  ) AS ok
UNION ALL
SELECT
  '2. profiles has total_questions_correct',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_questions_correct'
  )
UNION ALL
SELECT
  '3. profiles has total_questions_incorrect',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_questions_incorrect'
  )
UNION ALL
SELECT
  '4. function increment_profile_stats exists',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_profile_stats'
  );

-- ========== 2. Blocked username terms (20250218000005) ==========
SELECT
  '5. table blocked_username_terms exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'blocked_username_terms'
  ) AS ok
UNION ALL
SELECT
  '6. blocked_username_terms has seed rows',
  (SELECT COUNT(*)::int FROM public.blocked_username_terms) >= 10
UNION ALL
SELECT
  '7. function check_username_blocklist exists',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_username_blocklist'
  )
UNION ALL
SELECT
  '8. trigger check_username_blocklist_trigger on profiles',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles' AND t.tgname = 'check_username_blocklist_trigger'
  );

-- ========== 3. Profile stats from attempts (20250218000006) ==========
SELECT
  '9. function increment_profile_stats_for_user exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_profile_stats_for_user'
  ) AS ok
UNION ALL
SELECT
  '10. function on_attempt_completed exists',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'on_attempt_completed'
  )
UNION ALL
SELECT
  '11. trigger on_attempt_completed_trigger on attempts',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'attempts' AND t.tgname = 'on_attempt_completed_trigger'
  );
