-- Idea/contact submissions from users (public form, admin-only read)
CREATE TABLE public.idea_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.idea_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (anon or authenticated)
CREATE POLICY idea_submissions_insert ON public.idea_submissions FOR INSERT
  WITH CHECK (TRUE);

-- Only admins can read
CREATE POLICY idea_submissions_select_admin ON public.idea_submissions FOR SELECT
  USING (public.is_admin());

COMMENT ON TABLE public.idea_submissions IS 'User idea/feedback submissions from contact form; admin-only view.';
