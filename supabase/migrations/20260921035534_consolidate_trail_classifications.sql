-- Vocabulary consolidation only: preserve every boundary and pacing adjustment.
-- Existing keys remain accepted for compatibility with older deployed clients.
DO $$
DECLARE
  before_hash text;
  after_hash text;
BEGIN
  LOCK TABLE public.terrain_nodes IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(string_agg((to_jsonb(t) - 'type')::text, '' ORDER BY id))
    INTO before_hash FROM public.terrain_nodes t;

  UPDATE public.terrain_nodes
  SET type = CASE
    WHEN type = 'smooth_dirt_gravel' THEN 'dirt'
    ELSE 'technical'
  END
  WHERE type IN ('smooth_dirt_gravel', 'runnable_trail', 'double_track', 'single_track');

  SELECT md5(string_agg((to_jsonb(t) - 'type')::text, '' ORDER BY id))
    INTO after_hash FROM public.terrain_nodes t;
  IF before_hash IS DISTINCT FROM after_hash THEN
    RAISE EXCEPTION 'Terrain remap changed fields other than classification';
  END IF;
END $$;
