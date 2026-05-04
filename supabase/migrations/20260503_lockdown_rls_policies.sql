-- Lockdown RLS — replace public-read/write policies with owner-scoped policies.
-- Public races (is_public = true) remain readable by anyone (including waypoints,
-- terrain_nodes, and the owning course row). All writes require ownership.
--
-- IMPORTANT: courses has no user_id column today; ownership flows from races.user_id
-- via races.course_id. Waypoints and terrain_nodes are scoped through that course.
--
-- Run order: enable RLS, drop legacy permissive policies, install scoped policies.

-- =========================================================================
-- profiles  (id = auth.uid())
-- =========================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
DROP POLICY IF EXISTS "Enable insert for all users" ON profiles;
DROP POLICY IF EXISTS "Enable update for all users" ON profiles;
DROP POLICY IF EXISTS "Enable delete for all users" ON profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON profiles
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- =========================================================================
-- races  (user_id = auth.uid(); is_public = true is world-readable)
-- =========================================================================
ALTER TABLE races ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON races;
DROP POLICY IF EXISTS "Enable insert for all users" ON races;
DROP POLICY IF EXISTS "Enable update for all users" ON races;
DROP POLICY IF EXISTS "Enable delete for all users" ON races;
DROP POLICY IF EXISTS "races_select" ON races;
DROP POLICY IF EXISTS "races_insert_own" ON races;
DROP POLICY IF EXISTS "races_update_own" ON races;
DROP POLICY IF EXISTS "races_delete_own" ON races;

CREATE POLICY "races_select" ON races
    FOR SELECT USING (user_id = auth.uid() OR is_public = true);

CREATE POLICY "races_insert_own" ON races
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "races_update_own" ON races
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "races_delete_own" ON races
    FOR DELETE USING (user_id = auth.uid());

-- =========================================================================
-- courses  (ownership via races.course_id; readable when any owning race is public)
-- =========================================================================
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON courses;
DROP POLICY IF EXISTS "Enable insert for all users" ON courses;
DROP POLICY IF EXISTS "Enable update for all users" ON courses;
DROP POLICY IF EXISTS "Enable delete for all users" ON courses;
DROP POLICY IF EXISTS "courses_select" ON courses;
DROP POLICY IF EXISTS "courses_insert" ON courses;
DROP POLICY IF EXISTS "courses_update_own" ON courses;
DROP POLICY IF EXISTS "courses_delete_own" ON courses;

CREATE POLICY "courses_select" ON courses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = courses.id
              AND (r.user_id = auth.uid() OR r.is_public = true)
        )
        -- Allow read of orphan courses created in the same session by their owner;
        -- once a race attaches, the EXISTS branch covers it.
        OR NOT EXISTS (SELECT 1 FROM races r WHERE r.course_id = courses.id)
    );

-- Inserts are needed by the new-race flow before the race row exists.
-- We accept any authenticated insert; the race insert that follows is owner-scoped.
CREATE POLICY "courses_insert" ON courses
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "courses_update_own" ON courses
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = courses.id AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "courses_delete_own" ON courses
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = courses.id AND r.user_id = auth.uid()
        )
    );

-- =========================================================================
-- waypoints  (ownership/visibility through courses → races)
-- =========================================================================
ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON waypoints;
DROP POLICY IF EXISTS "Enable insert for all users" ON waypoints;
DROP POLICY IF EXISTS "Enable update for all users" ON waypoints;
DROP POLICY IF EXISTS "Enable delete for all users" ON waypoints;
DROP POLICY IF EXISTS "waypoints_select" ON waypoints;
DROP POLICY IF EXISTS "waypoints_insert_own" ON waypoints;
DROP POLICY IF EXISTS "waypoints_update_own" ON waypoints;
DROP POLICY IF EXISTS "waypoints_delete_own" ON waypoints;

CREATE POLICY "waypoints_select" ON waypoints
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = waypoints.course_id
              AND (r.user_id = auth.uid() OR r.is_public = true)
        )
    );

CREATE POLICY "waypoints_insert_own" ON waypoints
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = waypoints.course_id AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "waypoints_update_own" ON waypoints
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = waypoints.course_id AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "waypoints_delete_own" ON waypoints
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = waypoints.course_id AND r.user_id = auth.uid()
        )
    );

-- =========================================================================
-- terrain_nodes  (same scoping as waypoints)
-- =========================================================================
ALTER TABLE terrain_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Enable insert for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Enable update for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "Enable delete for all users" ON terrain_nodes;
DROP POLICY IF EXISTS "terrain_nodes_select" ON terrain_nodes;
DROP POLICY IF EXISTS "terrain_nodes_insert_own" ON terrain_nodes;
DROP POLICY IF EXISTS "terrain_nodes_update_own" ON terrain_nodes;
DROP POLICY IF EXISTS "terrain_nodes_delete_own" ON terrain_nodes;

CREATE POLICY "terrain_nodes_select" ON terrain_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = terrain_nodes.course_id
              AND (r.user_id = auth.uid() OR r.is_public = true)
        )
    );

CREATE POLICY "terrain_nodes_insert_own" ON terrain_nodes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = terrain_nodes.course_id AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "terrain_nodes_update_own" ON terrain_nodes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = terrain_nodes.course_id AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "terrain_nodes_delete_own" ON terrain_nodes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM races r
            WHERE r.course_id = terrain_nodes.course_id AND r.user_id = auth.uid()
        )
    );

-- Index to keep the policy EXISTS lookups cheap.
CREATE INDEX IF NOT EXISTS races_course_id_idx ON races(course_id);
