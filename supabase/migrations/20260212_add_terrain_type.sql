-- Add terrain_type to races table
ALTER TABLE races ADD COLUMN IF NOT EXISTS terrain_type text DEFAULT 'trail';
