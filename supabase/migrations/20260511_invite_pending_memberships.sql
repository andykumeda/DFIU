-- Invite-by-email flow — pending memberships table claimed on signup.
--
-- Flow:
--   1. Any member calls invite-race-member edge function with target email.
--   2. Edge function (service role) inserts pending_race_memberships row
--      and calls auth.admin.inviteUserByEmail with redirect to set-password.
--   3. New auth.users row → handle_new_user trigger claims pending rows by
--      email, materializing race_memberships and deleting pending rows.
--
-- Permission rules:
--   - Any member of a race may invite others (defaults to permission='view').
--   - Only owners may invite with permission='edit' or insert race_memberships
--     directly (existing user added via search flow).
--   - Pending row cancel: owner OR original inviter.

-- =========================================================================
-- 1. Helper: user_is_race_member(rid)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.user_is_race_member(rid uuid)
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
        OR EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_race_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_race_member(uuid) TO authenticated;

-- =========================================================================
-- 2. pending_race_memberships
-- =========================================================================
CREATE TABLE IF NOT EXISTS pending_race_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL CHECK (role IN ('crew', 'pacer')),
    permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
    invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Email stored lowercase (enforced by trigger below) so onConflict can use
-- raw column tuple from PostgREST upsert.
CREATE UNIQUE INDEX IF NOT EXISTS pending_race_memberships_unique_email
    ON pending_race_memberships (race_id, email);
CREATE INDEX IF NOT EXISTS pending_race_memberships_email_idx
    ON pending_race_memberships (email);

CREATE OR REPLACE FUNCTION public.pending_race_memberships_normalize_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.email := lower(trim(NEW.email));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pending_race_memberships_normalize ON pending_race_memberships;
CREATE TRIGGER trg_pending_race_memberships_normalize
BEFORE INSERT OR UPDATE ON pending_race_memberships
FOR EACH ROW EXECUTE FUNCTION public.pending_race_memberships_normalize_email();

ALTER TABLE pending_race_memberships ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. pending_race_memberships RLS
-- =========================================================================
DROP POLICY IF EXISTS "Members can view pending invites" ON pending_race_memberships;
DROP POLICY IF EXISTS "Members can insert pending invites" ON pending_race_memberships;
DROP POLICY IF EXISTS "Owners or inviter can delete pending" ON pending_race_memberships;

-- Members of the race can see pending invites for that race.
CREATE POLICY "Members can view pending invites" ON pending_race_memberships
    FOR SELECT USING (user_is_race_member(race_id));

-- Members can insert invites, but only with permission='view'.
-- Owners may also insert permission='edit'.
CREATE POLICY "Members can insert pending invites" ON pending_race_memberships
    FOR INSERT WITH CHECK (
        (user_is_race_member(race_id) AND permission = 'view')
        OR user_owns_race(race_id)
    );

-- Owner OR the original inviter may cancel.
CREATE POLICY "Owners or inviter can delete pending" ON pending_race_memberships
    FOR DELETE USING (
        user_owns_race(race_id)
        OR invited_by = auth.uid()
    );

-- =========================================================================
-- 4. Extend race_memberships INSERT — let any member add an existing user
--    with permission='view'. Owners retain full control.
-- =========================================================================
DROP POLICY IF EXISTS "Owners can insert memberships" ON race_memberships;
CREATE POLICY "Members can insert view memberships, owners insert any" ON race_memberships
    FOR INSERT WITH CHECK (
        user_owns_race(race_id)
        OR (
            user_is_race_member(race_id)
            AND permission = 'view'
            AND role IN ('crew', 'pacer')
        )
    );

-- =========================================================================
-- 5. handle_new_user — claim pending memberships on signup
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    INSERT INTO public.profiles (id, name, avatar_url)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url;

    -- Claim pending invites by email (case-insensitive).
    IF new.email IS NOT NULL THEN
        INSERT INTO race_memberships (race_id, user_id, role, permission, granted_by, granted_at)
        SELECT race_id, new.id, role, permission, invited_by, now()
        FROM pending_race_memberships
        WHERE lower(email) = lower(new.email)
        ON CONFLICT DO NOTHING;

        DELETE FROM pending_race_memberships
        WHERE lower(email) = lower(new.email);
    END IF;

    RETURN new;
END;
$function$;

-- Trigger should already exist from prior migration; re-create defensively.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- 6. RPC — list pending invites for a race (members only)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_pending_race_invites(p_race_id uuid)
RETURNS TABLE(
    id uuid,
    email text,
    role text,
    permission text,
    invited_by uuid,
    invited_by_name text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
    SELECT
        p.id,
        p.email,
        p.role,
        p.permission,
        p.invited_by,
        prof.name AS invited_by_name,
        p.created_at
    FROM pending_race_memberships p
    LEFT JOIN profiles prof ON prof.id = p.invited_by
    WHERE p.race_id = p_race_id
      AND user_is_race_member(p_race_id)
    ORDER BY p.created_at DESC;
$func$;

REVOKE EXECUTE ON FUNCTION public.get_pending_race_invites(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_race_invites(uuid) TO authenticated;
