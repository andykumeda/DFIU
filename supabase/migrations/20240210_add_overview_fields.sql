-- Add new columns for Race Overview to the races table

ALTER TABLE races
ADD COLUMN IF NOT EXISTS registration_url text,
ADD COLUMN IF NOT EXISTS avg_temp_high text,
ADD COLUMN IF NOT EXISTS avg_temp_low text,
ADD COLUMN IF NOT EXISTS precip_chance text,
ADD COLUMN IF NOT EXISTS weather_notes text,
ADD COLUMN IF NOT EXISTS moon_phase text,
ADD COLUMN IF NOT EXISTS sunrise_time text,
ADD COLUMN IF NOT EXISTS sunset_time text,
ADD COLUMN IF NOT EXISTS overall_cutoff text,
ADD COLUMN IF NOT EXISTS course_record_male text,
ADD COLUMN IF NOT EXISTS course_record_female text,
ADD COLUMN IF NOT EXISTS qualifies_for text,
ADD COLUMN IF NOT EXISTS course_type text;

COMMENT ON COLUMN races.avg_temp_high IS 'Average high temperature (e.g., "75°F")';
COMMENT ON COLUMN races.qualifies_for IS 'Comma-separated list or description of events this race qualifies for';
