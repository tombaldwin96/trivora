-- Seed: categories, sample questions, daily quiz, initial season
-- Run after migrations

INSERT INTO public.categories (id, name, slug, is_active, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'General Knowledge', 'general', TRUE, 1),
  ('a0000000-0000-0000-0000-000000000002', 'Science', 'science', TRUE, 2),
  ('a0000000-0000-0000-0000-000000000003', 'History', 'history', TRUE, 3),
  ('a0000000-0000-0000-0000-000000000004', 'Sports', 'sports', TRUE, 4),
  ('a0000000-0000-0000-0000-000000000005', 'Entertainment', 'entertainment', TRUE, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.questions (id, category_id, prompt, answers_json, correct_index, explanation, difficulty, time_limit_ms, is_active) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'What is the capital of France?', '["London", "Berlin", "Paris", "Madrid"]', 2, 'Paris is the capital and largest city of France.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'How many continents are there?', '["5", "6", "7", "8"]', 2, 'There are 7 continents: Africa, Antarctica, Asia, Europe, North America, Oceania, South America.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'What is the chemical symbol for water?', '["H2O", "CO2", "O2", "NaCl"]', 0, 'Water is composed of two hydrogen atoms and one oxygen atom.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Which planet is known as the Red Planet?', '["Venus", "Mars", "Jupiter", "Saturn"]', 1, 'Mars is called the Red Planet due to its reddish appearance.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'In which year did World War II end?', '["1943", "1944", "1945", "1946"]', 2, 'World War II ended in 1945 with the surrender of Japan.', 2, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'What is the largest ocean on Earth?', '["Atlantic", "Indian", "Arctic", "Pacific"]', 3, 'The Pacific Ocean is the largest and deepest of the world''s oceans.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 'What is the speed of light in vacuum (approximately)?', '["300,000 km/s", "150,000 km/s", "500,000 km/s", "1 million km/s"]', 0, 'The speed of light in vacuum is about 299,792 km/s.', 2, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003', 'Who wrote "Romeo and Juliet"?', '["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"]', 1, 'William Shakespeare wrote the tragedy in the late 1590s.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000004', 'In which sport is the Stanley Cup awarded?', '["Football", "Basketball", "Ice Hockey", "Baseball"]', 2, 'The Stanley Cup is the championship trophy of the NHL.', 1, 15000, TRUE),
  ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000005', 'Which band sang "Bohemian Rhapsody"?', '["The Beatles", "Queen", "Led Zeppelin", "Pink Floyd"]', 1, 'Queen released "Bohemian Rhapsody" in 1975.', 1, 15000, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Initial 1v1 season (all divisions)
INSERT INTO public.seasons (id, mode, division, season_number, starts_at, ends_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', '1v1', 1, 1, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z'),
  ('c0000000-0000-0000-0000-000000000002', '1v1', 2, 1, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z'),
  ('c0000000-0000-0000-0000-000000000003', '1v1', 3, 1, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z'),
  ('c0000000-0000-0000-0000-000000000004', '1v1', 4, 1, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z'),
  ('c0000000-0000-0000-0000-000000000005', '1v1', 5, 1, '2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z')
ON CONFLICT DO NOTHING;

-- Daily quiz placeholder (one per day can be created by cron or admin)
INSERT INTO public.quizzes (id, type, title, description, status) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'daily', 'Daily Quiz', 'Today''s 10 questions', 'published')
ON CONFLICT DO NOTHING;

INSERT INTO public.quiz_questions (quiz_id, question_id, order_index)
SELECT 'd0000000-0000-0000-0000-000000000001', id, row_number() OVER () - 1
FROM public.questions
WHERE is_active = TRUE
LIMIT 10
ON CONFLICT (quiz_id, question_id) DO NOTHING;
