-- Single live stream state for the app: one broadcaster (tombaldwin1996), viewers see stream on Live tab.
-- Only one row; is_live true means stream is active.
CREATE TABLE IF NOT EXISTS public.app_live_stream (
  id TEXT PRIMARY KEY DEFAULT 'main',
  is_live BOOLEAN NOT NULL DEFAULT false,
  room_name TEXT NOT NULL DEFAULT 'trivora-live',
  started_at TIMESTAMPTZ,
  started_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one row
INSERT INTO public.app_live_stream (id, is_live) VALUES ('main', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can read; only authenticated can update (app checks streamer identity)
ALTER TABLE public.app_live_stream ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_live_stream"
  ON public.app_live_stream FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated can update app_live_stream"
  ON public.app_live_stream FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can insert app_live_stream"
  ON public.app_live_stream FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Enable Realtime for app_live_stream in Supabase Dashboard (Table Editor -> app_live_stream -> Realtime) so viewers see when stream goes live/off.

COMMENT ON TABLE public.app_live_stream IS 'Current app live stream state; streamer sets is_live via app, viewers subscribe for playback.';
