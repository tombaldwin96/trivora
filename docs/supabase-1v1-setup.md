# Supabase setup for 1v1 online play

## What’s already done in the repo

- **Schema**: `matches_1v1`, `match_rounds`, `standings`, `seasons`, `invites` and RLS are in migrations.
- **Seed**: `seed.sql` creates categories, sample questions, and **1v1 seasons** (one per division, 2025). Run it after migrations so seasons exist.
- **RLS**: Participants can SELECT/INSERT/UPDATE their matches and standings; invites are restricted to from_user/to_user. A new migration adds **match_rounds** INSERT/UPDATE for match participants so the app can record round answers.

## What you need to do in Supabase

### 1. Run migrations and seed

In the Supabase dashboard or CLI:

- Apply all migrations under `supabase/migrations/` (so RLS and the new `match_rounds` policies are in place).
- Run `supabase/seed.sql` so you have:
  - Categories and questions
  - **1v1 seasons** (divisions 1–5)
  - A published daily quiz

Without the seed, there are no seasons and 1v1 matchmaking has nothing to attach to.

### 2. Auth (no extra config for 1v1)

- Email/OTP, Apple, Facebook (or other providers) are configured in **Authentication → Providers**.
- On first sign-in, the trigger in `20250215000003_auth_profile_trigger.sql` creates a row in `profiles` (with a generated username). No extra setup needed for 1v1 beyond that.

### 3. Realtime (optional but useful for live 1v1)

If the app shows “opponent answered” or live match state:

- Run migration **`20250215000005_realtime_publication.sql`** (adds `matches_1v1` and `match_rounds` to the Realtime publication), **or**
- In the Dashboard go to **Database → Publications**, open **`supabase_realtime`**, and enable the tables **`matches_1v1`** and **`match_rounds`**.
- In the app, subscribe with `supabase.channel(...).on('postgres_changes', ...)` (see **`docs/supabase-realtime-setup.md`** for a full walkthrough).

If 1v1 is turn-based or poll-based, you can skip this.

### 4. No special config for invites

Invites use the `invites` table and `deep_link_code`. The app only needs to create invites (from_user, deep_link_code, mode, etc.) and handle opening those links (e.g. accept invite → create or join match). No Supabase dashboard setting required.

---

## Summary checklist

| Step | Action |
|------|--------|
| Migrations | Run all migrations (including `20250215000004_match_rounds_participant_policies.sql`) |
| Seed | Run `seed.sql` so seasons and questions exist |
| Auth | Ensure your login providers (Email, Apple, Facebook) are enabled; profile trigger creates `profiles` |
| Realtime | Optional: run `20250215000005_realtime_publication.sql` or add tables in **Database → Publications**; see `docs/supabase-realtime-setup.md` |

After this, the database and RLS are ready for 1v1: creating matches, recording rounds, and updating standings from the app will work.
