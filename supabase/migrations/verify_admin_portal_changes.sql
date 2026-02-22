-- Run this to verify the last admin portal changes are in place.
-- Expect: all checks return true or the listed rows.

-- 1. push_notification_log table exists and has expected columns
SELECT
  'push_notification_log table' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'push_notification_log'
  ) AS ok;

SELECT
  'push_notification_log columns' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'push_notification_log' AND column_name = 'created_by')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'push_notification_log' AND column_name = 'recipient_count')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'push_notification_log' AND column_name = 'sent_at')
  AS ok;

-- 2. profiles.is_blocked exists
SELECT
  'profiles.is_blocked column' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_blocked'
  ) AS ok;

-- 3. Admin RPCs exist
SELECT
  'get_admin_push_token_counts' AS check_name,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_admin_push_token_counts')
  AS ok;

SELECT
  'get_admin_push_notification_log' AS check_name,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_admin_push_notification_log')
  AS ok;

-- 4. Optional: run the RPCs (as a user with is_admin you’d get data; here we just check they execute)
-- Uncomment and run as an admin user if you want to test:
-- SELECT * FROM get_admin_push_token_counts();
-- SELECT * FROM get_admin_push_notification_log(5);
