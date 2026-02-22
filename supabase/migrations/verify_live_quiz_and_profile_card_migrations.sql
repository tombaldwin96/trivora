-- Run this in Supabase SQL Editor to verify live quiz + profile card migrations (58–66) are all applied.
-- Expected: all rows should have ok = true. If any ok = false, run the corresponding migration(s) and fix.

-- ========== 58: live_quiz_schema ==========
SELECT '58_live_quiz_sessions_table' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_quiz_sessions') AS ok
UNION ALL SELECT '58_live_quiz_state_table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_quiz_state')
UNION ALL SELECT '58_live_quiz_scores_table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_quiz_scores')
UNION ALL SELECT '58_live_quiz_leaderboard_snapshot_table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_quiz_leaderboard_snapshot')
UNION ALL SELECT '58_live_quiz_session_created_trigger',
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE n.nspname = 'public' AND c.relname = 'live_quiz_sessions' AND t.tgname = 'live_quiz_session_created_trigger')

-- ========== 59: live_quiz_allow_draft_read ==========
UNION ALL SELECT '59_live_quiz_sessions_select_policy',
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'live_quiz_sessions' AND policyname = 'live_quiz_sessions_select_active')

-- ========== 60: live_quiz_kicked ==========
UNION ALL SELECT '60_live_quiz_kicked_table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_quiz_kicked')

-- ========== 61–63: live_quiz_state columns ==========
UNION ALL SELECT '61_live_quiz_state_siren_played_at',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'live_quiz_state' AND column_name = 'siren_played_at')
UNION ALL SELECT '62_live_quiz_state_show_leaderboard_until',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'live_quiz_state' AND column_name = 'show_leaderboard_until')
UNION ALL SELECT '63_live_quiz_state_mahan_sweep_at',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'live_quiz_state' AND column_name = 'mahan_sweep_at')

-- ========== 64: live_quiz_winners ==========
UNION ALL SELECT '64_live_quiz_winners_table',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_quiz_winners')
UNION ALL SELECT '64_profiles_live_quiz_win_count',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'live_quiz_win_count')
UNION ALL SELECT '64_increment_live_quiz_win_count',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'increment_live_quiz_win_count')

-- ========== 65: live_quiz_win_star_permanent ==========
UNION ALL SELECT '65_live_quiz_win_count_guard_trigger',
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid
   WHERE n.nspname = 'public' AND c.relname = 'profiles' AND t.tgname = 'live_quiz_win_count_guard_trigger')
UNION ALL SELECT '65_get_user_profile_card_has_live_quiz_win_count',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'get_user_profile_card' AND pg_get_functiondef(p.oid) LIKE '%live_quiz_win_count%')
UNION ALL SELECT '65_get_daily_quiz_leaderboard_returns_live_quiz_win_count',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'get_daily_quiz_leaderboard' AND pg_get_functiondef(p.oid) LIKE '%live_quiz_win_count%')

-- ========== 66: profile_card_live_quiz_stats ==========
UNION ALL SELECT '66_get_user_profile_card_has_live_quizzes_participated',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'get_user_profile_card' AND pg_get_functiondef(p.oid) LIKE '%live_quizzes_participated%')
UNION ALL SELECT '66_get_user_profile_card_has_live_quiz_top_10_finishes',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname = 'get_user_profile_card' AND pg_get_functiondef(p.oid) LIKE '%live_quiz_top_10_finishes%')
ORDER BY check_name;
