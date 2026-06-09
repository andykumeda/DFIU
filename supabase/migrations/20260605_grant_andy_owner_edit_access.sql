-- Ensure the canonical owner account can administer and edit every race.
-- This repairs production rows where older races or imported official events
-- may not have an explicit owner/edit membership for andy@kumeda.com.

WITH owner_user AS (
    SELECT id
    FROM auth.users
    WHERE lower(email) = 'andy@kumeda.com'
    LIMIT 1
)
INSERT INTO site_admins (user_id)
SELECT id
FROM owner_user
ON CONFLICT (user_id) DO NOTHING;

WITH owner_user AS (
    SELECT id
    FROM auth.users
    WHERE lower(email) = 'andy@kumeda.com'
    LIMIT 1
)
INSERT INTO race_memberships (
    race_id,
    user_id,
    role,
    permission,
    granted_by,
    granted_at,
    is_runner,
    is_pacer,
    is_crew
)
SELECT
    races.id,
    owner_user.id,
    'owner',
    'edit',
    owner_user.id,
    now(),
    true,
    false,
    false
FROM races
CROSS JOIN owner_user
ON CONFLICT (race_id, user_id) DO UPDATE
SET
    role = 'owner',
    permission = 'edit',
    is_runner = true,
    is_pacer = false,
    is_crew = false,
    granted_by = COALESCE(race_memberships.granted_by, EXCLUDED.granted_by);
