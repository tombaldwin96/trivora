-- Add columns and extend difficulty for Google Sheet import (Category, Sub category, Question, Options, Language, Difficulty 1-5, Appeal 1-5)

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS sub_category TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS appeal SMALLINT;

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_difficulty_check CHECK (difficulty BETWEEN 1 AND 5);

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_appeal_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_appeal_check CHECK (appeal IS NULL OR (appeal BETWEEN 1 AND 5));

COMMENT ON COLUMN public.questions.sub_category IS 'From sheet column B';
COMMENT ON COLUMN public.questions.language IS 'From sheet column H';
COMMENT ON COLUMN public.questions.appeal IS 'From sheet column J, 1=least to 5=most';
