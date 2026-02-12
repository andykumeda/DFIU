-- Add date/time fields for resources
ALTER TABLE races
ADD COLUMN IF NOT EXISTS packet_pickup_datetime timestamptz,
ADD COLUMN IF NOT EXISTS briefing_datetime timestamptz;

COMMENT ON COLUMN races.packet_pickup_datetime IS 'Date and time of packet pickup';
COMMENT ON COLUMN races.briefing_datetime IS 'Date and time of the pre-race briefing';
