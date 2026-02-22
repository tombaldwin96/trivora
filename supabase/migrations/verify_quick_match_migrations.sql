-- Run this in Supabase SQL Editor to verify these migrations applied successfully:
--   20250219000001_matches_1v1_player_b_nullable.sql
--   20250219000002_claim_waiting_match_atomic.sql
-- Expected: all checks return ok = true.

-- ========== 20250219000001: player_b nullable ==========
SELECT
  '1. matches_1v1.player_b is nullable' AS check_name,
  (a.attnotnull = false) AS ok
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname = 'matches_1v1'
  AND a.attname = 'player_b'
  AND a.attnum > 0
  AND NOT a.attisdropped
UNION ALL
SELECT
  '2. matches_1v1.player_b has comment',
  EXISTS (
    SELECT 1 FROM pg_description d
    JOIN pg_class c ON d.objoid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.objsubid AND a.attname = 'player_b'
    WHERE n.nspname = 'public' AND c.relname = 'matches_1v1'
  );

-- ========== 20250219000002: indexes and function ==========
SELECT
  '3. index idx_matches_1v1_player_a_active exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'matches_1v1' AND indexname = 'idx_matches_1v1_player_a_active'
  ) AS ok
UNION ALL
SELECT
  '4. index idx_matches_1v1_player_b_active exists',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'matches_1v1' AND indexname = 'idx_matches_1v1_player_b_active'
  )
UNION ALL
SELECT
  '5. index idx_matches_1v1_waiting_claim exists',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'matches_1v1' AND indexname = 'idx_matches_1v1_waiting_claim'
  )
UNION ALL
SELECT
  '6. function claim_waiting_quick_match exists',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'claim_waiting_quick_match'
  )
UNION ALL
SELECT
  '7. claim_waiting_quick_match has 3 parameters',
  COALESCE(
    (SELECT p.pronargs = 3 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'claim_waiting_quick_match'),
    false
  );

-- Summary: run and confirm all rows show ok = true.
-- If any ok = false, re-run the two migrations and fix errors.
