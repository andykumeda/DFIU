-- Add delay column to waypoints table (in minutes)
ALTER TABLE waypoints ADD COLUMN IF NOT EXISTS delay integer DEFAULT 0;
