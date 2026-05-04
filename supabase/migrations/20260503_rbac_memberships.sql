-- RBAC — site_admins + race_memberships, helpers, backfill, RLS rewrite.
--
-- Schema:
--   site_admins         (user_id) — global admin allowlist
--   race_memberships    (race_id, user_id, role, permission, capabilities, ...)
--
-- Helpers (SECURITY DEFINER → bypass RLS to avoid recursion):
--   user_can_view_race(rid)  → member OR admin OR is_public
--   user_can_edit_race(rid)  → member.permission='edit' OR admin
--   user_owns_race(rid)      → member.role='owner' OR admin
--
-- AFTER INSERT trigger on races auto-creates owner+edit membership for the
-- creator, so the existing new-race flow keeps working.
--
-- Backfill: every existing races.user_id → owner+edit row. Owners experience
-- no behavior change post-migration.
--
-- Site admin bootstrap is intentionally hard-coded for andy@kumeda.com (Q1=a,
-- manual SQL). Edit before applying if a different admin is needed.

-- =========================================================================
-- 1. site_admins
-- =========================================================================
CREATE TABLE IF NOT EXISTS site_admins (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view own admin row" ON site_admins;
CREATE POLICY "Admins can view own admin row" ON site_admins
    FOR SELECT USING (user_id = auth.uid());
-- No client-side write policies; bootstrap and changes go through SQL.

-- =========================================================================
-- 2. race_memberships
-- =========================================================================
CREATE TABLE IF NOT EXISTS race_memberships (
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'crew', 'pacer')),
    permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
    capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
    granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (race_id, user_id)
);

CREATE INDEX IF NOT EXISTS race_memberships_user_id_idx ON race_memberships(user_id);

ALTER TABLE race_memberships ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. Helper functions (SECURITY DEFINER bypasses RLS internally)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.user_can_view_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM races WHERE id = rid AND is_public = true);
$$;

CREATE OR REPLACE FUNCTION public.user_can_edit_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid() AND permission = 'edit'
        )
        OR EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.user_owns_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid() AND role = 'owner'
        )
        OR EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_view_race(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_edit_race(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_owns_race(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_race(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_edit_race(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_race(uuid) TO anon, authenticated;

-- =========================================================================
-- 4. AFTER INSERT trigger — auto-create owner membership on race create
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_race_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        INSERT INTO race_memberships (race_id, user_id, role, permission, granted_by, granted_at)
        VALUES (NEW.id, NEW.user_id, 'owner', 'edit', NEW.user_id, now())
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_race_owner_membership ON races;
CREATE TRIGGER trg_create_race_owner_membership
AFTER INSERT ON races
FOR EACH ROW EXECUTE FUNCTION public.create_race_owner_membership();

-- =========================================================================
-- 5. Backfill from races.user_id
-- =========================================================================
INSERT INTO race_memberships (race_id, user_id, role, permission, granted_by, granted_at)
    SELECT id, user_id, 'owner', 'edit', user_id, COALESCE(created_at, now())
    FROM races
    WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 6. Site admin bootstrap (Q1 = manual SQL insert)
-- =========================================================================
INSERT INTO site_admins (user_id)
VALUES ('eda6cfd7-3fc5-407f-ae97-03e7ceced324')
ON CONFLICT DO NOTHING;

-- =========================================================================
-- 7. race_memberships RLS — owners (and admins) manage memberships;
--    members can see fellow members on shared races.
-- =========================================================================
DROP POLICY IF EXISTS "Members can view memberships on shared races" ON race_memberships;
DROP POLICY IF EXISTS "Owners can insert memberships" ON race_memberships;
DROP POLICY IF EXISTS "Owners can update memberships" ON race_memberships;
DROP POLICY IF EXISTS "Owners can delete memberships" ON race_memberships;

CREATE POLICY "Members can view memberships on shared races" ON race_memberships
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "Owners can insert memberships" ON race_memberships
    FOR INSERT WITH CHECK (user_owns_race(race_id));

CREATE POLICY "Owners can update memberships" ON race_memberships
    FOR UPDATE USING (user_owns_race(race_id)) WITH CHECK (user_owns_race(race_id));

CREATE POLICY "Owners can delete memberships" ON race_memberships
    FOR DELETE USING (user_owns_race(race_id));

-- =========================================================================
-- 8. RLS rewrite on existing tables — replace owner-by-user_id with
--    membership-keyed access. Backfill keeps owners working.
-- =========================================================================

-- ---------- races ----------
DROP POLICY IF EXISTS "Public races are viewable by everyone" ON races;
DROP POLICY IF EXISTS "Users can view own races" ON races;
DROP POLICY IF EXISTS "Users can insert own races" ON races;
DROP POLICY IF EXISTS "Users can update own races" ON races;
DROP POLICY IF EXISTS "Users can delete own races" ON races;

CREATE POLICY "races_select" ON races
    FOR SELECT USING (user_can_view_race(id));

CREATE POLICY "races_insert" ON races
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "races_update" ON races
    FOR UPDATE USING (user_can_edit_race(id)) WITH CHECK (user_can_edit_race(id));

CREATE POLICY "races_delete" ON races
    FOR DELETE USING (user_owns_race(id));

-- ---------- courses (chained via courses.race_id) ----------
DROP POLICY IF EXISTS "Public courses are viewable by everyone" ON courses;
DROP POLICY IF EXISTS "Users can view courses for own races" ON courses;
DROP POLICY IF EXISTS "Users can insert courses for own races" ON courses;
DROP POLICY IF EXISTS "Users can update courses for own races" ON courses;
DROP POLICY IF EXISTS "Users can delete courses for own races" ON courses;

CREATE POLICY "courses_select" ON courses
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "courses_insert" ON courses
    FOR INSERT WITH CHECK (user_can_edit_race(race_id));

CREATE POLICY "courses_update" ON courses
    FOR UPDATE USING (user_can_edit_race(race_id)) WITH CHECK (user_can_edit_race(race_id));

CREATE POLICY "courses_delete" ON courses
    FOR DELETE USING (user_owns_race(race_id));

-- ---------- waypoints (chained via courses → races) ----------
DROP POLICY IF EXISTS "Public waypoints are viewable by everyone" ON waypoints;
DROP POLICY IF EXISTS "Users can view waypoints for own races" ON waypoints;
DROP POLICY IF EXISTS "Users can insert waypoints for own races" ON waypoints;
DROP POLICY IF EXISTS "Users can update waypoints for own races" ON waypoints;
DROP POLICY IF EXISTS "Users can delete waypoints for own races" ON waypoints;

CREATE POLICY "waypoints_select" ON waypoints
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = waypoints.course_id
              AND user_can_view_race(c.race_id)
        )
    );

CREATE POLICY "waypoints_insert" ON waypoints
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = waypoints.course_id
              AND user_can_edit_race(c.race_id)
        )
    );

CREATE POLICY "waypoints_update" ON waypoints
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = waypoints.course_id
              AND user_can_edit_race(c.race_id)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = waypoints.course_id
              AND user_can_edit_race(c.race_id)
        )
    );

CREATE POLICY "waypoints_delete" ON waypoints
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = waypoints.course_id
              AND user_can_edit_race(c.race_id)
        )
    );

-- ---------- terrain_nodes (chained via courses → races) ----------
DROP POLICY IF EXISTS "Public terrain_nodes are viewable by everyone" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can view terrain_nodes for own races" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can insert terrain_nodes for own races" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can update terrain_nodes for own races" ON terrain_nodes;
DROP POLICY IF EXISTS "Users can delete terrain_nodes for own races" ON terrain_nodes;

CREATE POLICY "terrain_nodes_select" ON terrain_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = terrain_nodes.course_id
              AND user_can_view_race(c.race_id)
        )
    );

CREATE POLICY "terrain_nodes_insert" ON terrain_nodes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = terrain_nodes.course_id
              AND user_can_edit_race(c.race_id)
        )
    );

CREATE POLICY "terrain_nodes_update" ON terrain_nodes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = terrain_nodes.course_id
              AND user_can_edit_race(c.race_id)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = terrain_nodes.course_id
              AND user_can_edit_race(c.race_id)
        )
    );

CREATE POLICY "terrain_nodes_delete" ON terrain_nodes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = terrain_nodes.course_id
              AND user_can_edit_race(c.race_id)
        )
    );
