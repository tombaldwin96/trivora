# Auth setup (email OTP sign-in)

For email OTP (6-digit code) sign-in to work, check the following in your **Supabase project**:

## 1. Dashboard → Authentication → Providers

- **Email** provider must be **enabled**.

## 2. Dashboard → Authentication → Email Templates

- For **Magic Link** (used by `signInWithOtp`):
  - To send a **6-digit code** instead of a link, the template body must include:
    - `{{ .Token }}`
  - Example:  
    `Your code is: {{ .Token }}`  
  - If you only use the default link (e.g. `{{ .ConfirmationURL }}`), users get a link, not a code; the app expects a 6-digit code.

## 3. Environment variables (mobile app)

- `EXPO_PUBLIC_SUPABASE_URL` – e.g. `https://YOUR_PROJECT.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` – anon/public key from Project Settings → API

**Local / Expo dev:** Put these in `apps/mobile/.env`. Restart the dev server after changing.

**TestFlight / EAS production builds:** EAS Build runs in the cloud and does not use your local `.env`. Add the same two variables in the Expo Dashboard: [expo.dev](https://expo.dev) → your project → **Environment variables**. Create `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then run a new EAS build. Without these, the app will show "Supabase URL not set" (or "supabaseUrl is required") on launch.

## 4. One code, one attempt

- Each code can only be used **once**. The app now sends a single verify request per code (type `email`). Do not tap "Sign in" more than once with the same code.
- If the email contains both a **link** and a **6-digit code**, use only the **code** on mobile. Clicking the link (e.g. if it opens in a browser at your Site URL) can consume the token, so the code would then show "expired or invalid".

## 5. OTP expiry

- Codes expire after **1 hour** by default. In Dashboard → **Authentication → Providers → Email** you can set "Email OTP expiration" (max 24 hours).
- Use a **newly requested** code: tap "Resend code", wait for the email, then enter the 6 digits once. Old or already-used codes will show "Token has expired or is invalid".

## 6. Is there SQL or a config file to fix verify?

**No.** OTP verification is handled entirely by **Supabase Auth (GoTrue)**. There is no SQL migration or database change that can fix "token has expired or is invalid" – that logic lives in the Auth API, not in your database. Everything that affects it is in the **Dashboard** (or, if self-hosting, in `config.toml`).

**Dashboard checklist (all under your project):**

| Where | What to check |
|-------|----------------|
| **Authentication → Providers** | **Email** = ON. |
| **Authentication → Providers → Email** | "Email OTP expiration" (e.g. 3600 seconds = 1 hour). If it's very low, codes may expire before use. |
| **Authentication → Email Templates → Magic link** | Subject/body use **`{{ .Token }}`** for the 6-digit code. No other token/link variable that might send a different value. **Save** after editing. |
| **Authentication → URL Configuration** | **Site URL** – used for redirects; doesn't affect code-based verify, but keep it correct for your app. |
| **Authentication → Hooks** | If you have a "Customize Email" or "Send SMS" hook, ensure it doesn't change or drop the token. Disable hooks temporarily to test. |

If you use **custom SMTP** (Authentication → Project Settings → Auth SMTP), the content is still from the Magic link template; SMTP doesn't change how the token is generated or verified.

## 7. If verification still fails

- **"Code expired or invalid"** – Request a new code (Resend code) and enter it within the expiry time.
- **"Configuration error"** – URL or anon key missing in the app; check `.env` and restart.
- **"Code didn't work"** – The alert shows the exact message from Supabase; use it to debug (e.g. rate limit).
