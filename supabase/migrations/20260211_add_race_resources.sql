-- Add resource fields to races table
ALTER TABLE races
ADD COLUMN IF NOT EXISTS racebook_url text,
ADD COLUMN IF NOT EXISTS racebook_last_updated timestamptz,
ADD COLUMN IF NOT EXISTS briefing_url text,
ADD COLUMN IF NOT EXISTS packet_pickup_url text,
ADD COLUMN IF NOT EXISTS past_results_url text,
ADD COLUMN IF NOT EXISTS media_url text, -- Live updates / tracking / photos
ADD COLUMN IF NOT EXISTS entrants_url text,
ADD COLUMN IF NOT EXISTS tracking_url text,
ADD COLUMN IF NOT EXISTS lodging_info text;

COMMENT ON COLUMN races.racebook_url IS 'URL to the digital racebook or PDF';
COMMENT ON COLUMN races.lodging_info IS 'Markdown text for lodging and dining recommendations';
