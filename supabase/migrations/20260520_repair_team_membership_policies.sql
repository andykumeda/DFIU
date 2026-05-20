-- Repair production state after the role-view migration was recorded despite
-- hitting an existing policy name. Also tightens older invite policies so only
-- team managers can add crew/pacer memberships or pending invites.

DROP POLICY IF EXISTS "Members can insert view memberships, owners insert any" ON race_memberships;
DROP POLICY IF EXISTS "Managers can insert memberships" ON race_memberships;
DROP POLICY IF EXISTS "Managers can update memberships" ON race_memberships;
DROP POLICY IF EXISTS "Managers can delete memberships" ON race_memberships;

CREATE POLICY "Managers can insert memberships" ON race_memberships
    FOR INSERT WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "Managers can update memberships" ON race_memberships
    FOR UPDATE USING (user_can_manage_team(race_id)) WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "Managers can delete memberships" ON race_memberships
    FOR DELETE USING (user_can_manage_team(race_id));

DROP POLICY IF EXISTS "Members can insert pending invites" ON pending_race_memberships;
DROP POLICY IF EXISTS "Members can view pending invites" ON pending_race_memberships;
DROP POLICY IF EXISTS "Owners or inviter can delete pending" ON pending_race_memberships;
DROP POLICY IF EXISTS "Managers can insert pending invites" ON pending_race_memberships;
DROP POLICY IF EXISTS "Managers can view pending invites" ON pending_race_memberships;
DROP POLICY IF EXISTS "Managers or inviter can delete pending" ON pending_race_memberships;

CREATE POLICY "Managers can insert pending invites" ON pending_race_memberships
    FOR INSERT WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "Managers can view pending invites" ON pending_race_memberships
    FOR SELECT USING (user_can_manage_team(race_id));

CREATE POLICY "Managers or inviter can delete pending" ON pending_race_memberships
    FOR DELETE USING (user_can_manage_team(race_id) OR invited_by = auth.uid());
