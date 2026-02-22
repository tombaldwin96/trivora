-- Random questions filtered by category slug and optional sub_category (for History 10, Geography 10, etc.).
CREATE OR REPLACE FUNCTION public.get_random_questions_by_category(
  p_limit INT DEFAULT 10,
  p_exclude_ids UUID[] DEFAULT '{}',
  p_category_slug TEXT DEFAULT NULL,
  p_sub_category TEXT DEFAULT NULL
)
RETURNS SETOF public.questions
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT q.*
  FROM public.questions q
  JOIN public.categories c ON c.id = q.category_id AND c.is_active = TRUE
  WHERE q.is_active = TRUE
    AND (cardinality(p_exclude_ids) = 0 OR q.id != ALL(p_exclude_ids))
    AND (p_category_slug IS NULL OR c.slug = LOWER(TRIM(p_category_slug)))
    AND (
      p_sub_category IS NULL
      OR TRIM(p_sub_category) = ''
      OR q.sub_category IS NOT NULL AND (
        TRIM(LOWER(q.sub_category)) = TRIM(LOWER(p_sub_category))
        OR q.sub_category ILIKE '%' || TRIM(p_sub_category) || '%'
      )
    )
  ORDER BY random()
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));
$$;

COMMENT ON FUNCTION public.get_random_questions_by_category(INT, UUID[], TEXT, TEXT) IS
  'Returns random active questions for a category (by slug) and optional sub_category (e.g. Capital Cities).';

GRANT EXECUTE ON FUNCTION public.get_random_questions_by_category(INT, UUID[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_questions_by_category(INT, UUID[], TEXT, TEXT) TO anon;
