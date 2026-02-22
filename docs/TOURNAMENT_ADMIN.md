# The Trivora Global Quiz Rankings – Admin Guide

## Overview

The flagship annual tournament ("The Trivora Global Quiz Rankings") and national tournaments are driven by Supabase. Content and timing are **admin-configurable** without code changes.

## Database

- **tournaments** – Extended with `type` ('global' | 'national'), `name`, `description`, `entry_fee_pence`, `prize_pence`, `registration_opens_at`, `games_begin_at`, `finals_at`, `finals_time_window`, `awards_at`, `finals_top_n`, `status`, etc.
- **tournament_registrations** – One row per user per tournament; `payment_status` ('unpaid' | 'paid' | 'refunded'). **Never trust client:** only set `payment_status = 'paid'` after server-side payment verification (Stripe/Apple/Google webhook).
- **tournament_rounds** – Round definitions (Round of 256, 128, … 16) per tournament.
- **tournament_matches** – Bracket matches; scoring is server-authoritative (edge function or admin).
- **tournament_honours** – Winners/runners-up (placement, user_id, note) for the Honours section.

## Running the Migrations

1. **Schema:** `supabase/migrations/20250220000052_global_quiz_rankings_tournament.sql`
2. **Seed Year 1:** `supabase/migrations/20250220000053_seed_global_quiz_rankings_year1.sql`

Apply via `supabase db push` or run the SQL in the Supabase SQL editor. The seed uses a fixed UUID for the first global tournament so re-running updates the row.

## Updating the Next Tournament (No Code Deploy)

1. In Supabase **Table Editor** → **tournaments**, select the global tournament row (or create a new one).
2. Edit:
   - **name** – e.g. "The Trivora Global Quiz Rankings"
   - **registration_opens_at**, **games_begin_at**, **finals_at**, **awards_at** (timestamptz)
   - **finals_time_window** – e.g. "9:00am – 3:00pm"
   - **location_city**, **location_country**, **finals_venue_name** (when known)
   - **status** – `upcoming` | `registration_open` | `in_progress` | `finals` | `completed`
3. Save. The website and app read from this table.

## Payment (TODO)

- **Web:** Integrate Stripe Checkout for £5 entry; on success, call a webhook or edge function to set `tournament_registrations.payment_status = 'paid'` for that user/tournament.
- **App:** Use in-app purchase (Apple/Google); verify receipt server-side and then set `payment_status = 'paid'`.
- **Testing:** Manually set `payment_status` to `paid` in **tournament_registrations** for a user to simulate a paid registration.

## Match Results (Server-Authoritative)

- Use the edge function **tournament-report-match** (service role) to submit match results: `match_id`, `winner_user_id`, `player_a_score`, `player_b_score`, optional `idempotency_key`.
- Or update **tournament_matches** directly as admin: set `status = 'completed'`, `winner_user_id`, `player_a_score`, `player_b_score`, `completed_at`.
- **TODO:** Bracket progression (create next-round matches, detect Top 16) is not yet implemented; add in a migration or edge function.

## Honours (Winners)

- Insert into **tournament_honours**: `tournament_id`, `placement` (1 = champion, 2 = runner-up, 3–4, 5–16), `user_id`, `note` (e.g. "Global Champion").
- The website Honours section reads from this table (placeholder UI is in place; wire the query to display past champions).

## Live Finals Venue

- Update **tournaments.finals_venue_name** and any venue details in the copy when the venue is confirmed.
- **TODO:** Check-in (QR) and finalist instructions can be sent by email or in-app when implemented.

## Edge Functions

- **tournament-register** – Authenticated user registers for a tournament; inserts/upserts `tournament_registrations` with `unpaid` for paid events (payment must be verified separately).
- **tournament-report-match** – Service role only; marks a match completed and sets winner/scores. Idempotency key supported in body; bracket advancement is TODO.

## Summary

| Task | Where | Notes |
|------|--------|------|
| Change dates / status | Supabase → tournaments | No deploy |
| Mark user as paid | Supabase → tournament_registrations | For testing only; production = payment webhook |
| Add rounds | tournament_rounds | Admin insert |
| Report match result | Edge function or table | Server-authoritative |
| Add past champions | tournament_honours | Honours section on web |
