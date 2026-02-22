# Deploying www.trivoraapp.com

This app is the combined **marketing site** (homepage) and **admin portal** for Trivora.

- **Homepage:** https://www.trivoraapp.com — AAA-style landing (live quizzes, game modes, tournaments, CTAs).
- **Admin:** https://www.trivoraapp.com/admin — Username `tom`, password `baldwin` (or set `ADMIN_USERNAME` / `ADMIN_PASSWORD` in env).

---

## Simplest way to get the admin portal online

**Option A – Use it from anywhere right now (no deploy)**  
Run the app locally (`pnpm --filter @trivora/web dev` or your usual command on port 3001), then expose it with a tunnel:

- **ngrok:** `npx ngrok http 3001` → use the HTTPS URL (e.g. `https://abc123.ngrok.io/admin`).
- **Cloudflare Tunnel:** `npx cloudflared tunnel --url http://localhost:3001` → use the printed URL.

Your machine must stay on and the dev server running. Good for quick access from another device or sharing a link.

**Option B – Deploy so it’s always online (Render)**  
1. Render → **Web Service** → connect GitHub repo.  
2. **Root directory:** leave **empty**.  
3. **Build command:** `pnpm install --ignore-scripts && pnpm exec turbo run build --filter=@trivora/web...`  
4. **Start command:** `pnpm --filter @trivora/web start`  
5. **Environment:** Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and optional `ADMIN_USERNAME`, `ADMIN_PASSWORD`).  
6. Deploy. Your admin is at **https://&lt;your-service&gt;.onrender.com/admin**.

---

## Will the admin tools work?

**Yes, for the parts that are built.** When you set the required env vars (see below), the following work on deploy:

| Admin page      | Status | Notes |
|-----------------|--------|--------|
| **Categories**  | ✅ Works | Lists categories from Supabase; read-only table. |
| **Ideas**       | ✅ Works | Lists contact-form submissions from `idea_submissions`. |
| **Audit logs**  | ✅ Works | Lists `audit_logs` from Supabase. |
| Users           | Placeholder | UI only; no user list or actions yet. |
| Questions       | Placeholder | UI only; no question list or edit yet. |
| Quizzes         | Placeholder | UI only. |
| Live / Live Quiz| Placeholder | No LiveKit or live-quiz controls yet. |
| Reports / Stats / Push | Placeholder | UI only. |

**Requirement:** Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your deployment environment. Without them, Categories / Ideas / Audit show a “Configure…” message instead of data.

For **full admin** (Live Quiz control, question management, user list, etc.) the standalone **apps/admin** app has more features; you could deploy that separately or port those features into this web app later.

---

## Deploy options

### Option 1: Vercel (recommended for Next.js)

Best fit for Next.js: zero config, serverless, preview deploys per branch, and env vars per environment.

1. **Vercel:** [vercel.com](https://vercel.com) → Add New Project → Import your repo.
2. **Root directory:** Set to `apps/web` so Vercel detects Next.js. (Monorepo: use repo root and set Build to `pnpm install && pnpm --filter @trivora/web build`; override “Output Directory” if needed.)
3. **Framework:** Next.js (auto-detected when root is `apps/web`).
4. **Build command:** `pnpm build` when root is `apps/web`. From repo root use `pnpm install && pnpm --filter @trivora/web build`.
5. **Environment variables:** In Project → Settings → Environment Variables add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Optional: `ADMIN_USERNAME`, `ADMIN_PASSWORD`
6. **Custom domain:** Project → Settings → Domains → add `www.trivoraapp.com`.

No start command needed; Vercel runs the Next.js serverless runtime.

---

### Option 2: Render (Web Service)

Use a **Web Service** so Next.js runs with Server Actions, auth, and Supabase. No static export; one Node server.

**Important:** This app is in a pnpm monorepo and depends on `@trivora/ui`, `@trivora/core`, `@trivora/supabase`. You must build from the **repo root** so those workspace packages are installed and linked. Do **not** set Root Directory to `apps/web` or the build will fail with "Can't resolve '@trivora/ui'".

1. **Render dashboard:** New → **Web Service**.
2. **Connect** your repo (e.g. GitHub).
3. **Settings:**
   - **Root directory:** leave **empty** (use repo root).
   - **Build command:** `pnpm install --ignore-scripts && pnpm exec turbo run build --filter=@trivora/web...`  
     (`--ignore-scripts` skips the mobile postinstall (~3 min). Turbo then builds only the web app and its deps: `@trivora/core`, `@trivora/ui`, `@trivora/supabase`, then web. Start still uses the same command below.)
   - **Start command:** `pnpm --filter @trivora/web start`
   - **Publish directory:** leave empty.

4. **Environment variables** (Render → Environment):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - Optional: `ADMIN_USERNAME`, `ADMIN_PASSWORD` (defaults: `tom` / `baldwin`).

5. **Custom domain:** Add `www.trivoraapp.com` (and optionally redirect `trivoraapp.com`).

---

### Option 3: Render Static Site (limited)

To deploy as a **Static Site** (no Node server, HTML/CSS/JS only):

**Limitation:** This app uses **Server Actions** (contact form, admin login). Static export does **not** support Server Actions, so the build will fail with `output: 'export'` until those are removed or replaced.

**If you still want a static site** (e.g. marketing-only, no admin):

1. In `next.config.js` add: `output: 'export'`.
2. Remove or replace Server Actions:
   - **Contact:** Point the form to an external endpoint (e.g. Supabase Edge Function or third-party form service) instead of a server action.
   - **Admin:** Omit admin from the static build or protect it via a separate app/backend.
3. Add `generateStaticParams()` to every dynamic route (`match/[id]`, `invite/[code]`, `tournaments/[id]`) returning at least one placeholder (e.g. `[{ id: '_' }]`) so static export can build.
4. **Build:** From repo root: `pnpm install && pnpm --filter @trivora/web build`.
5. **Render:** New → **Static Site**. Connect repo.
   - **Build command:** `pnpm install && pnpm --filter @trivora/web build` (with root directory set so the monorepo root is used, or run from repo root).
   - **Publish directory:** `apps/web/out` (Next.js writes static export to `out`).

Only routes pre-generated by `generateStaticParams` will have HTML; other dynamic URLs (e.g. `/match/abc`) will 404 unless you pre-list them.

**Recommendation:** Use **Vercel** or **Render Web Service** so the full site and admin work without code changes.

---

## After deploy

- **https://www.trivoraapp.com** — marketing homepage.
- **https://www.trivoraapp.com/admin** — sign in (e.g. `tom` / `baldwin`); set `ADMIN_PASSWORD` in production.
