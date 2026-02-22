# Importing questions

Use the import script with an **Excel (.xlsx)** or CSV file. **Prefer .xlsx** so you can keep one workbook with all columns (Category, Sub category, Question, options, Language, Difficulty, Appeal) and run the import without exporting.

## 1. Spreadsheet format

Use a spreadsheet (Excel or Google Sheets) with these columns:

| Column | Header example | Description |
|--------|----------------|-------------|
| A | Category | Category name (e.g. General Knowledge, Science). Created if missing. |
| B | Sub category | Optional sub-category text. |
| C | Question | The question text (prompt). |
| D | Option 1 (correct) | First answer option — **treated as correct**. |
| E | Option 2 | Second option. |
| F | Option 3 | Third option. |
| G | Option 4 | Fourth option. |
| H | Language | Optional (e.g. `en`). |
| I | Difficulty (1-5) | 1 = easiest, 5 = hardest. Default 2 if empty. |
| J | Appeal (1-5) | Optional. |

- You need at least **Category**, **Question**, and **Option 1**. Options 2–4 are optional but you must have at least 2 options total.
- The script **shuffles** the answer order when inserting, so Option 1 is always stored as the correct answer, then order is randomised for players.

A template is in `questions-import-template.csv`.

## 2. Your file

- **Excel (.xlsx) — recommended:** Use your workbook as-is. The script reads the **first sheet**. Fill columns A–J so every question has Category, Sub category, Question, 4 options, Language, Difficulty, Appeal.
- **CSV:** Also supported if you export from Excel/Sheets.

Example run with .xlsx:

```bash
pnpm --filter @trivora/supabase run import-questions -- "c:\users\tomba\documents\questions.xlsx"
```

## 3. Set Supabase env vars

The script loads `.env` from:

- the **repo root** (`D:\Apps\Mahan`),
- **`apps/mobile`** (so you can keep your env there and run from the mobile folder),
- or the current directory.

Put in your `.env` (e.g. in `apps/mobile` or repo root):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Important:** You must use the **service role** key for import. The anon key cannot insert into `categories` or `questions` (RLS will block it). Add `SUPABASE_SERVICE_ROLE_KEY` to the same `.env`; get it from Supabase Dashboard → Project Settings → API → **service_role** (secret, not the anon key).

Get values from Supabase Dashboard → Project Settings → API.

## 4. Add columns for appeal, language, sub_category (required for sorting/filtering)

To sort and filter questions by **appeal**, **language**, and **sub_category** when choosing which to distribute, the `questions` table must have those columns. Apply this **once** in your Supabase project:

1. Open **Supabase Dashboard** → your project → **SQL Editor** → **New query**.
2. Paste and run the following (safe to run multiple times; uses `IF NOT EXISTS`):

```sql
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS sub_category TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS appeal SMALLINT;

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_difficulty_check CHECK (difficulty BETWEEN 1 AND 5);

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_appeal_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_appeal_check CHECK (appeal IS NULL OR (appeal BETWEEN 1 AND 5));
```

3. After this, the import script will fill **sub_category**, **language**, and **appeal** so you can filter and sort by them when building quizzes.

## 5. Run the import

You can run from **repo root** or from **`apps/mobile`** (the script will load `apps/mobile/.env`):

```bash
# From repo root (D:\Apps\Mahan) — use your .xlsx or .csv path:
pnpm --filter @trivora/supabase run import-questions -- "c:\users\tomba\documents\questions.xlsx"

# Or from apps/mobile:
cd D:\Apps\Mahan\apps\mobile
pnpm --filter @trivora/supabase run import-questions -- "c:\users\tomba\documents\questions.xlsx"
```

Use your actual file path (`.xlsx` or `.csv`) in quotes. The `--` is required before the path when using `run import-questions`. Add **`--verbose`** to see sample skipped rows (e.g. `run import-questions -- --verbose "path/to/file.csv"`) so you can fix column/blank issues.

**If you see "tsx not found"**: run the same command from the **repo root** (`cd D:\Apps\Mahan` first). The script will still load `apps/mobile/.env` when it runs.

## 6. What happens

- Categories are looked up by **slug** (lowercase, hyphenated name). If a category doesn’t exist, it is created.
- Each row becomes one row in `public.questions` with:
  - `answers_json` = the 2–4 options in a random order
  - `correct_index` = the index of the correct answer after shuffling
  - `difficulty` 1–5, `sub_category`, `language`, `appeal` from the sheet
- Rows are **skipped** when: (1) question (column C) or option 1 (column D) is empty, (2) there are fewer than 2 answer options, (3) category create/lookup fails, (4) **already exists** (same question text + category), or (5) the question insert fails. You can **re-run** the same file safely: existing questions (same prompt + category) are skipped so nothing is duplicated. The script prints a **skip reasons** summary at the end.

## Alternative: JSON / SQL

- For one-off or small sets you can copy the structure from `supabase/seed.sql` and run SQL or use the Supabase SQL editor.
- For bulk custom logic you could write a small script that reads JSON and calls the same Supabase `questions` and `categories` inserts.

Using the CSV script above is the **simplest and best-supported** way to import questions.
