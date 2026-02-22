-- Diversified random questions: cap per category (e.g. max 2 per category per quiz)
-- so quizzes don't repeat the same type (e.g. capital cities) too often.

DROP FUNCTION IF EXISTS public.get_random_questions(INT, UUID[]);

CREATE OR REPLACE FUNCTION public.get_random_questions(
  p_limit INT DEFAULT 10,
  p_exclude_ids UUID[] DEFAULT '{}',
  p_max_per_category INT DEFAULT 2
)
RETURNS SETOF public.questions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));
  v_max_per_cat INT := GREATEST(1, LEAST(COALESCE(p_max_per_category, 2), 10));
BEGIN
  RETURN QUERY
  WITH pool AS (
    SELECT q.id, q.category_id
    FROM public.questions q
    WHERE q.is_active = TRUE
      AND (cardinality(p_exclude_ids) = 0 OR q.id != ALL(p_exclude_ids))
  ),
  ranked AS (
    SELECT id, category_id, row_number() OVER (PARTITION BY category_id ORDER BY random()) AS rn
    FROM pool
  ),
  capped AS (
    SELECT id FROM ranked WHERE rn <= v_max_per_cat
  ),
  shuffled AS (
    SELECT id FROM capped ORDER BY random()
  ),
  first_ids AS (
    SELECT id FROM shuffled LIMIT v_limit
  ),
  needed_ct AS (
    SELECT GREATEST(0, v_limit - (SELECT count(*)::INT FROM first_ids)) AS n
  ),
  fill_ids AS (
    SELECT p.id
    FROM pool p
    WHERE p.id NOT IN (SELECT id FROM first_ids)
    ORDER BY random()
    LIMIT (SELECT n FROM needed_ct)
  ),
  combined_ids AS (
    SELECT id FROM first_ids
    UNION ALL
    SELECT id FROM fill_ids
  )
  SELECT q.*
  FROM public.questions q
  WHERE q.id IN (SELECT id FROM combined_ids)
  ORDER BY random();
END;
$$;

COMMENT ON FUNCTION public.get_random_questions(INT, UUID[], INT) IS
  'Returns random active questions with diversity: at most p_max_per_category (default 2) per category, then filled to p_limit.';

GRANT EXECUTE ON FUNCTION public.get_random_questions(INT, UUID[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_questions(INT, UUID[], INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_random_questions(INT, UUID[], INT) TO service_role;
