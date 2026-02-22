# Deploy the standalone Admin app (apps/admin)

This is the **full** admin portal: Supabase Auth (email/password), Live Quiz control, Questions, Users, etc. Deploy it as its own service and use a **separate domain** (e.g. `admin.yoursite.com` or your other domain).

## Render (Web Service)

1. **New Web Service** → Connect the same repo (trivora).
2. **Settings:**
   - **Root directory:** leave **empty** (repo root).
   - **Build command:**  
     `pnpm install --ignore-scripts && pnpm exec turbo run build --filter=@trivora/admin...`
   - **Start command:**  
     `pnpm --filter @trivora/admin start`
3. **Environment variables:**
   - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
   - `ADMIN_EMAIL` — Email for the "tom" username (e.g. `tom@yourdomain.com`). The login form accepts username `tom` and maps it to this email for Supabase Auth.
4. **Custom domain:** Add your admin domain (e.g. `admin.trivoraapp.com` or your other domain).

## One-time: create the admin user in Supabase

The app expects a Supabase Auth user whose email matches `ADMIN_EMAIL` and whose `profiles.is_admin` is `true`.

1. In Supabase Dashboard → Authentication → create a user with that email and a password (or use the script below).
2. Set `profiles.is_admin = true` for that user (SQL or Table Editor).

From the repo (with env set):

```bash
cd apps/admin && pnpm run create-admin-user
```

(Adjust the script if it uses different env; ensure the user exists and `profiles.is_admin` is true.)

## After deploy

- Open your admin URL (e.g. `https://admin.trivoraapp.com`).
- Sign in with username **tom** (or the email directly) and the password you set for that Supabase user.
- You get the full dashboard: Categories, Questions, Quizzes, Users, Live, Live Quiz, Reports, Stats, Push, Ideas, Audit.
