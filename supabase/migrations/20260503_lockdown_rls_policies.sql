-- Lockdown RLS — terrain_nodes is the only public-read/write table left.
-- Replaces "USING (true)" policies with ownership scoped via the
-- courses → races chain (real schema is courses.race_id, NOT
-- races.course_id), and adds an is_public read path matching waypoints.
--
-- All other public tables (profiles, races, courses, waypoints) already
-- have correct owner-scoped policies in production. Verified 2026-05-03.

-- =========================================================================
-- terrain_nodes  (was USING (true) on all four ops)
-- =========================================================================

DROP POLICY IF EXISTS "Enable read access for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Enable insert for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Enable update for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Enable delete for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Public terrain_nodes are viewable by everyone" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can view terrain_nodes for own races" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can insert terrain_nodes for own races" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can update terrain_nodes for own races" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can delete terrain_nodes for own races" ON terrain_nodes;

-- Public terrain visible on public races (matches waypoints pattern)
CREATE POLICY "Public terrain_nodes are viewable by everyone" ON terrain_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN races r ON r.id = c.race_id
            WHERE c.id = terrain_nodes.course_id
              AND r.is_public = true
        )
    );

CREATE POLICY "Users can view terrain_nodes for own races" ON terrain_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN races r ON r.id = c.race_id
            WHERE c.id = terrain_nodes.course_id
              AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert terrain_nodes for own races" ON terrain_nodes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN races r ON r.id = c.race_id
            WHERE c.id = terrain_nodes.course_id
              AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update terrain_nodes for own races" ON terrain_nodes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN races r ON r.id = c.race_id
            WHERE c.id = terrain_nodes.course_id
              AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete terrain_nodes for own races" ON terrain_nodes
    FOR DELETE USING (
        EXISTS (
            SELECT 1
            FROM courses c
            JOIN races r ON r.id = c.race_id
            WHERE c.id = terrain_nodes.course_id
              AND r.user_id = auth.uid()
        )
    );
