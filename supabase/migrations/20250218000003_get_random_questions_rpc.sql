-- Returns N random active questions, optionally excluding given IDs (for load balancing).
CREATE OR REPLACE FUNCTION public.get_random_questions(
  p_limit INT DEFAULT 10,
  p_exclude_ids UUID[] DEFAULT '{}'
)
RETURNS SETOF public.questions
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.questions
  WHERE is_active = TRUE
    AND (cardinality(p_exclude_ids) = 0 OR id != ALL(p_exclude_ids))
  ORDER BY random()
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION public.get_random_questions(INT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_questions(INT, UUID[]) TO anon;
