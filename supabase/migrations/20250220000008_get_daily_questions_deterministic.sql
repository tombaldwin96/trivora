-- Daily quiz: same questions for everyone each day, change at midnight UTC.
-- Uses deterministic ordering by (id + date) so the same 10 questions are picked for a given day.

CREATE OR REPLACE FUNCTION public.get_daily_questions(p_limit INT DEFAULT 10)
RETURNS SETOF public.questions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));
  v_max_per_cat INT := 2;
  v_day TEXT := ((now() AT TIME ZONE 'UTC')::date)::text;
BEGIN
  RETURN QUERY
  WITH pool AS (
    SELECT q.id, q.category_id
    FROM public.questions q
    WHERE q.is_active = TRUE
  ),
  ranked AS (
    SELECT id, category_id,
           row_number() OVER (PARTITION BY category_id ORDER BY md5(id::text || v_day)) AS rn
    FROM pool
  ),
  capped AS (
    SELECT id FROM ranked WHERE rn <= v_max_per_cat
  ),
  shuffled AS (
    SELECT id FROM capped ORDER BY md5(id::text || v_day)
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
    ORDER BY md5(p.id::text || v_day)
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
  ORDER BY md5(q.id::text || v_day);
END;
$$;

COMMENT ON FUNCTION public.get_daily_questions(INT) IS
  'Returns the same set of questions for everyone for the current UTC day. Changes at midnight UTC. Diversified (max 2 per category).';

GRANT EXECUTE ON FUNCTION public.get_daily_questions(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_questions(INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_daily_questions(INT) TO service_role;
