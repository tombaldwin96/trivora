-- Allow admins to block users; app should check this and deny session/actions for blocked users.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked ON public.profiles(is_blocked) WHERE is_blocked = TRUE;

COMMENT ON COLUMN public.profiles.is_blocked IS 'When true, user is blocked by admin; app should deny access.';
