-- Enforce username uniqueness case-insensitively (block "CoolUser" and "cooluser" both existing)
CREATE UNIQUE INDEX idx_profiles_username_lower ON public.profiles (LOWER(username));
