# Trivora Live Quiz — Operating instructions

This doc describes how to run a live quiz end-to-end: create session, set questions, set stream URL, start countdown, advance questions, reveal answers, and end.

## Architecture (short)

- **Session state** is the single source of truth: one row per session in `live_quiz_state`. All clients subscribe to it via Supabase Realtime (no subscription to raw answers).
- **Questions** are preloaded by clients (question pack fetched once via Edge Function `get-live-quiz-pack`). Realtime only sends state changes (e.g. `current_question_index`, `phase`), so clients reveal the correct preloaded question with no herd DB reads.
- **Leaderboard** uses snapshots: `live_quiz_leaderboard_snapshot` is updated every ~1s during open/reveal (from admin dashboard ticker) and on Reveal/End. Clients subscribe to the snapshot only (small payload, no storm).
- **Scoring** is server-authoritative: answers are submitted via Edge Function `submit-live-quiz-answer`, which validates phase and time window, clamps `elapsed_ms`, computes score, and updates `live_quiz_answers` and `live_quiz_scores`.

## 1. Create a session

1. Open **Admin Portal** → **Live Quiz**.
2. Click **Create new**. A new draft session is created and selected.
3. Optionally set **Title** (edit session title in DB or future UI).

## 2. Set questions

1. In the **Session questions** section, use **Search** to find questions by prompt.
2. Click **Add** next to a question to add it to the session (positions are assigned automatically).
3. Use **Remove** to drop a question from the list.
4. Order is by `position`; ensure enough questions for the run.

## 3. Set video stream URL (optional)

1. In **Video stream (HLS URL)** enter the HLS URL (e.g. from Mux, AWS IVS, Livepeer, Cloudflare Stream).
2. Click **Save**. This updates `live_quiz_state.video_stream_url`; the app will show the stream at the top when present.

## 4. Start countdown (“5 minutes until quiz”)

1. In **Countdown**, click **5 min** (or **2 min** / **30 sec**). This sets `phase = 'countdown'` and `countdown_ends_at = now + minutes`.
2. All connected clients see the countdown; when it hits zero they stay on countdown until you **Start now**.

## 5. Start the quiz (first question open)

1. Click **Start now**. This sets `phase = 'open'`, `current_question_index = 0`, and `question_started_at = now()`.
2. Session status becomes **live**. Players see the first question and timer; they can submit answers until you **Reveal**.

## 6. Advance and reveal

1. **Next** — Advances to the next question: increments `current_question_index`, sets `phase = 'open'`, `question_started_at = now()`. Use after each question (or after reveal). Confirm when prompted to avoid double-click.
2. **Reveal** — Locks answers and reveals the correct one: sets `phase = 'reveal'`, `reveal_started_at = now()`, and updates the leaderboard snapshot. Players see correct answer and points. Then click **Next** to move to the next question.

## 7. End the quiz

1. In **End quiz**, click **End quiz** and **Confirm**.
2. This sets `phase = 'ended'` and `message = 'Thanks for playing!'`, and writes a final leaderboard snapshot.
3. Players see the message and final leaderboard; session is closed for everyone.

## 8. Action log

The **Action log** panel shows recent `live_quiz_admin_actions` (COUNTDOWN, START, NEXT, REVEAL, END, etc.) for the selected session. Use it to verify actions and debug.

## Edge Functions (reference)

| Function | Purpose |
|----------|--------|
| `get-live-quiz-pack` | Returns ordered question pack for a session (auth required). |
| `join-live-quiz-session` | Adds the user to the session (inserts/ignores row in `live_quiz_scores` with 0,0,0) so they appear on the leaderboard; called automatically when opening the session in the app. |
| `submit-live-quiz-answer` | Server-authoritative submit; validates phase/time, computes score, upserts answer + aggregate. |
| `live-quiz-admin-countdown` | Sets countdown (body: `session_id`, `minutes`). |
| `live-quiz-admin-start` | Starts live (first question open). |
| `live-quiz-admin-next` | Advances to next question (idempotent). |
| `live-quiz-admin-reveal` | Sets phase reveal and updates leaderboard snapshot. |
| `live-quiz-admin-end` | Ends session and writes final snapshot. |
| `live-quiz-update-leaderboard-snapshot` | Refreshes top 25 for session (called by dashboard every 1s during open/reveal). |

## Database (main tables)

- `live_quiz_sessions` — Session metadata (title, status, created_by, scheduled_start_at).
- `live_quiz_state` — One row per session: phase, countdown_ends_at, current_question_index, question_started_at, question_duration_ms, video_stream_url, message. **Realtime enabled.**
- `live_quiz_session_questions` — Ordered question list (session_id, question_id, position).
- `live_quiz_answers` — One row per user per question (writes only via Edge Function).
- `live_quiz_scores` — Aggregate per user per session (total_score, correct_count, answered_count).
- `live_quiz_leaderboard_snapshot` — Top 10–25 (top_json); **Realtime enabled.**
- `live_quiz_admin_actions` — Audit log of admin actions.

## Mobile app flow

1. **Live** tab lists `live_quiz_sessions` with status `draft`, `scheduled`, or `live` under “Trivora Live Quiz”. Tapping one opens `/live-quiz/[id]`.
2. Opening a session calls **`join-live-quiz-session`** so the user is added to the leaderboard (0 pts) with their username and can submit answers.
3. **Live Quiz screen** subscribes to `live_quiz_state` and `live_quiz_leaderboard_snapshot`, fetches the question pack once via `get-live-quiz-pack`, and uses server-time sync for countdown and question timer.
4. Phases: **idle** → **countdown** (big countdown) → **open** (question + timer + answers) → **locked** (answers disabled) → **reveal** (correct answer + points) → **intermission** / next **open** → … → **ended** (thanks + final leaderboard).

## Load and safety

- No realtime subscription to `live_quiz_answers` (avoids broadcast storms).
- Leaderboard updates are snapshot-based (small payload, stable).
- Admin actions are idempotent where possible (e.g. Next advances index; double-click does not skip twice).
- Use confirmation modals for Next / Reveal / End to avoid accidental double-clicks.

## Video (v1)

- Admin sets an HLS URL in the dashboard; the app plays it with `expo-av` Video. No built-in streaming provider; use Mux, IVS, Livepeer, Cloudflare Stream, etc., and paste the HLS URL.
