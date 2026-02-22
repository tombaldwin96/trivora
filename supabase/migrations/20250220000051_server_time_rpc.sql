-- Returns current server time (UTC) for client sync. Clients use this to estimate server time and sync intro/outro.

CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOW();
$$;

COMMENT ON FUNCTION public.get_server_time() IS 'Returns server time for synchronized match intro/outro timing.';

GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO service_role;
