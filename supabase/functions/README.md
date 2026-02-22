# Supabase Edge Functions

## Invite flow

- **In-app invite (username)** uses database RPCs only: `create_invite_session`, `invite_by_username`, `respond_to_invite`. No Edge Function is used for sending or accepting in-app invites.
- **Link-based invite** uses:
  - `create-invite` – creates an invite and returns share URL (optional; app can use RPC for session then share link manually).
  - `accept-invite` – accepts by `code` (or `deep_link_code`). If the invite has `match_id`, the user joins that existing match; otherwise a new match is created (legacy behaviour).

## Tournament payments (Stripe)

- **create-tournament-checkout** – Creates a Stripe Checkout Session for paid tournament entry. Requires `STRIPE_SECRET_KEY`. Returns `{ url }`; the app opens it in the browser for the user to pay (e.g. £5).
- **stripe-tournament-webhook** – Stripe webhook for `checkout.session.completed`. Sets `tournament_registrations.payment_status = 'paid'` and `payment_provider = 'stripe'` using `metadata.tournament_id` and `metadata.user_id`. Requires `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (signing secret from Stripe Dashboard → Webhooks → Add endpoint; select event `checkout.session.completed`).

Secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

## Tournament payments (App Store / Apple IAP)

- **verify-apple-tournament-purchase** – Verifies an iOS In-App Purchase (tournament entry) with Apple’s App Store Server API and sets `tournament_registrations.payment_status = 'paid'`, `payment_provider = 'apple'`. Called by the app after a successful purchase with `tournament_id`, `transaction_id`, `product_id`.

**App Store Connect setup:** Create an In-App Purchase (consumable) with product ID `trivora_tournament_entry_5` (or update `TOURNAMENT_ENTRY_PRODUCT_ID` in `apps/mobile/lib/tournament-iap.ts` to match). In App Store Connect → Users and Access → Integrations → In-App Purchase, create a key, download the .p8 file once, and note Key ID and Issuer ID.

Secrets:

```bash
supabase secrets set APPLE_ISSUER_ID=...
supabase secrets set APPLE_KEY_ID=...
supabase secrets set APPLE_BUNDLE_ID=com.tombaldwin1996.trivora
# Contents of the .p8 file (single line or with \n for newlines)
supabase secrets set APPLE_PRIVATE_KEY_P8="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"
```

Then deploy: `supabase functions deploy verify-apple-tournament-purchase`

## Deploy

With Supabase CLI and project linked:

```bash
# Deploy all functions
supabase functions deploy

# Or deploy only invite-related
supabase functions deploy accept-invite
supabase functions deploy create-invite
```

Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in the project (they are usually provided by Supabase for deployed functions).
