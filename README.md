# Mahan

AAA-quality cross-platform quiz subscription product: daily quiz, 1v1 divisions, live quizzes, teams, tournaments (scaffolded). Monorepo with **iOS/Android (Expo)**, **Web (Next.js)**, **Admin (Next.js)**, shared **Supabase** backend.

---

## Folder structure

```
Mahan/
├── apps/
│   ├── mobile/          # Expo React Native (iOS/Android)
│   ├── web/              # Next.js App Router (consumer web)
│   └── admin/            # Next.js (admin portal)
├── packages/
│   ├── core/             # Shared types, scoring, validation, constants
│   ├── supabase/         # Typed client, DB types, seed script
│   └── ui/               # Shared web UI (Button, Card, Badge)
├── supabase/
│   ├── migrations/       # Postgres schema + RLS
│   ├── functions/        # Edge Functions (invite, match, live, profanity, etc.)
│   └── seed.sql          # Sample categories, questions, seasons
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

- **Node** ≥18
- **pnpm** 9.x (`npm i -g pnpm`)
- **Supabase** account (or local Supabase CLI)

---

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Settings → API**: copy **Project URL** and **anon public** key.
3. Optional: enable **Email** auth in Authentication → Providers.
4. **Social auth (mobile):** To use “Sign in with Apple” and “Sign in with Facebook” in the Expo app:
   - In Supabase Dashboard go to **Authentication → Providers** and enable **Apple** and **Facebook**. Configure each with your Apple Service ID / Facebook App ID and secrets as per [Supabase Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple) and [Supabase Facebook](https://supabase.com/docs/guides/auth/social-login/auth-facebook) docs.
   - In **Authentication → URL Configuration** add your app’s redirect URL to **Redirect URLs**. For the Expo app this is the scheme + path, e.g. `mahan://auth/callback` (or run the app and check the console for the exact redirect URL used).

---

## 2. Environment variables

### Root / Apps

Create `.env.local` (or `.env`) where needed:

**apps/web**

- `NEXT_PUBLIC_SUPABASE_URL` = Supabase project URL  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase anon key  
- `NEXT_PUBLIC_APP_URL` = e.g. `http://localhost:3000` (for signout redirect)

**apps/admin**

- `NEXT_PUBLIC_SUPABASE_URL`  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**apps/mobile**

- `EXPO_PUBLIC_SUPABASE_URL`  
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**Supabase Edge Functions** (in Supabase Dashboard → Edge Functions → secrets or `.env` in supabase/)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`  
- `MAHAN_APP_DEEP_LINK_BASE` = e.g. `mahan://invite`  
- `MAHAN_WEB_URL` = e.g. `https://yourapp.com` (for invite web fallback)  
- `CRON_SECRET` = optional, for leaderboard-rollups cron

---

## 3. Install and build

```bash
pnpm install
pnpm build
```

---

## 4. Database: migrations and seed

**Option A – Supabase Dashboard**

1. In SQL Editor, run each file in `supabase/migrations/` in order:
   - `20250215000001_initial_schema.sql`
   - `20250215000002_rls.sql`
   - `20250215000003_auth_profile_trigger.sql`
2. Then run `supabase/seed.sql` (or run the seed script against your DB).

**Option B – Supabase CLI (local)**

```bash
cd supabase
supabase start
supabase db reset   # applies migrations and can run seed if configured
```

**Seed script (optional)**

From repo root, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set:

```bash
pnpm db:seed
```

(Or run the SQL in `supabase/seed.sql` manually in the SQL Editor.)

---

## 5. Set admin role

After first user signup, set them as admin:

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE id = '<your-user-uuid>';
```

Or use email:

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
```

---

## 6. Run apps locally

**Web (port 3000)**

```bash
pnpm dev:web
# or: pnpm --filter @mahan/web dev
```

**Admin (port 3001)**

```bash
pnpm dev:admin
# or: pnpm --filter @mahan/admin dev
```

**Mobile (Expo)**

```bash
pnpm dev:mobile
# or: pnpm --filter @mahan/mobile dev
```

Then open iOS simulator, Android emulator, or scan QR with Expo Go.

---

## 7. Edge Functions

Deploy from Supabase Dashboard or CLI:

```bash
supabase functions deploy create-invite
supabase functions deploy accept-invite
supabase functions deploy profanity-check
supabase functions deploy sync-subscription
supabase functions deploy submit-answer
supabase functions deploy finalize-match
supabase functions deploy start-live-session
supabase functions deploy end-live-session
supabase functions deploy start-matchmaking
supabase functions deploy leaderboard-rollups
```

Set secrets (Dashboard → Edge Functions → secrets or CLI) as above.

---

## 8. Payments and live video (placeholders)

- **Stripe (web)**  
  Configure webhooks to point to your backend that calls `sync-subscription` or updates `subscriptions`; use `SUPABASE_SERVICE_ROLE_KEY` if needed.

- **RevenueCat (mobile)**  
  Webhook or server-side link to same subscription sync (e.g. call Edge Function with provider `revenuecat` and `app_user_id` = Supabase user id).

- **Mux / LiveKit**  
  Store API keys in env; in admin “Live” flow, when starting a session you would create a Mux live stream (or LiveKit room), set `playback_url` and optionally `stream_key_encrypted` on `live_sessions`. Client apps already read `playback_url` for the live tab.

---

## 9. Push notifications

- **Mobile:** Use Expo Push (e.g. `expo-notifications`). Store device tokens in `push_tokens`. Send “live starting soon”, “invite received”, “streak reminder” from a cron or webhook that calls Expo push API.
- **Web:** Optional web push; same `push_tokens` table with platform `web`.

---

## 10. Scripts reference

| Script           | Description                          |
|------------------|--------------------------------------|
| `pnpm build`     | Build all packages and apps         |
| `pnpm dev`       | Run all dev servers (turbo)         |
| `pnpm dev:web`   | Web app only (port 3000)            |
| `pnpm dev:admin` | Admin app only (port 3001)          |
| `pnpm dev:mobile`| Expo (mobile)                       |
| `pnpm db:migrate`| Run migrations (via supabase package)|
| `pnpm db:seed`   | Seed categories, questions, seasons |

---

## Assumptions

- **Auth:** Email/password; profile and free subscription row created on signup via trigger.
- **1v1:** Invite via Edge Function creates code and link; accept creates match and uses current season (division 5). Standings and promotions/relegations are updated by `finalize-match` (call when match ends).
- **Daily quiz:** One published quiz of type `daily`; attempts use `submit-answer` Edge Function for scoring with anti-cheat time clamp.
- **Leaderboards:** Daily rollup via `leaderboard-rollups` (cron); season leaderboard from `standings`.
- **Admin:** Only users with `profiles.is_admin = true` can access admin routes and manage content/users/reports/live.
- **V1 scaffold:** Arena, Team vs Team, Co-op, Tournaments, chat, VOD are stubbed or linked as “Coming in V1” where applicable.

---

## End-to-end flow (MVP)

1. **Sign up** on web or mobile → profile + subscription row created.
2. **Daily quiz:** Start quiz → create attempt → answer questions (submit-answer) → see result and leaderboard.
3. **1v1:** Create invite (create-invite) → share link → other user accepts (accept-invite) → match created; play rounds (scaffold), then call finalize-match to update standings.
4. **Leaderboards:** Daily from `leaderboard_daily` (run leaderboard-rollups cron); season from `standings`.
5. **Admin:** Sign in with admin user → Categories, Questions, Quizzes, Users, Live, Reports, Audit logs.

---

## License

Private / proprietary as required.
