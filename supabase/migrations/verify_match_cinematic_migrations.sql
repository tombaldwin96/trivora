-- Run this to verify the 4 match cinematic migrations (48–51) applied correctly.
-- Expect: no rows = something missing; 4 rows with ok = 1 = all good.

DO $$
DECLARE
  v_columns_ok INT := 0;
  v_rpc_intro_ok INT := 0;
  v_rpc_finalize_ok INT := 0;
  v_rpc_server_time_ok INT := 0;
BEGIN
  -- 1) matches_1v1 has intro/outro columns (migration 48)
  SELECT 1 INTO v_columns_ok
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'matches_1v1'
    AND column_name IN ('intro_started_at', 'intro_duration_ms', 'match_start_at', 'outro_started_at', 'outro_duration_ms')
  GROUP BY table_name
  HAVING COUNT(*) = 5;

  -- 2) set_match_intro_and_start exists (migration 49)
  SELECT 1 INTO v_rpc_intro_ok
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'set_match_intro_and_start';

  -- 3) finalize_1v1_match exists and references outro (migration 50)
  SELECT 1 INTO v_rpc_finalize_ok
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'finalize_1v1_match'
    AND pg_get_functiondef(p.oid) LIKE '%outro_started_at%';

  -- 4) get_server_time exists (migration 51)
  SELECT 1 INTO v_rpc_server_time_ok
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'get_server_time';

  RAISE NOTICE 'match_cinematic_intro_outro (48): %', CASE WHEN v_columns_ok = 1 THEN 'OK' ELSE 'MISSING' END;
  RAISE NOTICE 'set_match_intro_and_start_rpc (49): %', CASE WHEN v_rpc_intro_ok = 1 THEN 'OK' ELSE 'MISSING' END;
  RAISE NOTICE 'finalize_1v1_match_outro (50): %', CASE WHEN v_rpc_finalize_ok = 1 THEN 'OK' ELSE 'MISSING' END;
  RAISE NOTICE 'server_time_rpc (51): %', CASE WHEN v_rpc_server_time_ok = 1 THEN 'OK' ELSE 'MISSING' END;

  IF COALESCE(v_columns_ok, 0) + COALESCE(v_rpc_intro_ok, 0) + COALESCE(v_rpc_finalize_ok, 0) + COALESCE(v_rpc_server_time_ok, 0) = 4 THEN
    RAISE NOTICE 'All 4 match cinematic migrations verified.';
  ELSE
    RAISE WARNING 'One or more checks failed. Review migrations 20250220000048–51.';
  END IF;
END;
$$;

-- Result set: run this after the block above (or alone) to see status in the grid.
SELECT
  '48_match_cinematic_intro_outro' AS migration,
  (SELECT COUNT(*) = 5 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'matches_1v1'
     AND column_name IN ('intro_started_at','intro_duration_ms','match_start_at','outro_started_at','outro_duration_ms')) AS ok
UNION ALL
SELECT
  '49_set_match_intro_and_start_rpc',
  (SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'set_match_intro_and_start'))
UNION ALL
SELECT
  '50_finalize_1v1_match_outro',
  (SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'finalize_1v1_match' AND pg_get_functiondef(p.oid) LIKE '%outro_started_at%'))
UNION ALL
SELECT
  '51_server_time_rpc',
  (SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_server_time'));
