ALTER TABLE terrain_nodes
  DROP CONSTRAINT IF EXISTS terrain_nodes_type_check;

ALTER TABLE terrain_nodes
  ADD CONSTRAINT terrain_nodes_type_check
  CHECK (type IN (
    'paved',
    'dirt',
    'smooth_dirt_gravel',
    'runnable_trail',
    'technical',
    'highly_technical',
    'double_track',
    'single_track',
    'other'
  ));
