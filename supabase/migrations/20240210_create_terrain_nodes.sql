-- Create terrain_nodes table
CREATE TABLE IF NOT EXISTS terrain_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    mile DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL DEFAULT 'dirt' CHECK (type IN ('paved', 'dirt', 'technical', 'double_track', 'single_track', 'other')),
    difficulty INTEGER NOT NULL DEFAULT 100, -- Percentage, 100 = normal
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS terrain_nodes_course_id_idx ON terrain_nodes(course_id);

-- Enable RLS
ALTER TABLE terrain_nodes ENABLE ROW LEVEL SECURITY;

-- Policies (same as other tables, public read/write for now given the app state)
CREATE POLICY "Enable read access for all users" ON terrain_nodes FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON terrain_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON terrain_nodes FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON terrain_nodes FOR DELETE USING (true);
