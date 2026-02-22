-- Grant admin to tombaldwin1996@hotmail.co.uk so they can access the admin portal when signing in with that email.
UPDATE public.profiles
SET is_admin = true
WHERE id IN (SELECT id FROM auth.users WHERE email = 'tombaldwin1996@hotmail.co.uk');
