# Importing questions from Google Sheets

## Sheet format

| Column | Header example | Description |
|--------|----------------|-------------|
| A | Category | Main category (e.g. Science, History). Creates category if missing. |
| B | Sub category | Stored in `questions.sub_category`. |
| C | Question | The question text (`prompt`). |
| D | Option 1 | **Always the correct answer.** |
| E | Option 2 | Wrong option. |
| F | Option 3 | Wrong option. |
| G | Option 4 | Wrong option. |
| H | Language | Stored in `questions.language`. |
| I | Difficulty | 1–5 (1 = easy, 5 = very hard). |
| J | Appeal | 1–5 (1 = least appealing, 5 = most). |

The first row should be a header row (any text). Option order is shuffled on import so the correct answer isn’t always in the same position.

## Steps

1. **Run the new migration** (adds `sub_category`, `language`, `appeal`, and extends `difficulty` to 1–5):

   ```bash
   pnpm db:migrate
   # or: supabase db push / supabase migration up
   ```

2. **Export your Google Sheet as CSV**  
   File → Download → Comma-separated values (.csv).

3. **Run the import** from the repo root:

   ```bash
   pnpm --filter @trivora/supabase run import-questions -- path/to/your-questions.csv
   ```

   Or from `packages/supabase`:

   ```bash
   cd packages/supabase
   pnpm run import-questions -- ../path/to/your-questions.csv
   ```

4. **Environment**  
   Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY` if the anon key has insert rights), e.g. in `.env` or your shell.

Rows with missing question or option 1 are skipped. Categories are created by name (slug is derived from the name).
