-- Allow 1v1 match participants to insert/update match_rounds (record answers)
-- Previously only admin could write; participants need to submit their answers.

CREATE POLICY match_rounds_insert ON public.match_rounds FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches_1v1 m
      WHERE m.id = match_id AND (m.player_a = auth.uid() OR m.player_b = auth.uid())
    )
  );

CREATE POLICY match_rounds_update ON public.match_rounds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.matches_1v1 m
      WHERE m.id = match_id AND (m.player_a = auth.uid() OR m.player_b = auth.uid())
    )
  );
