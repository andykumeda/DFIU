-- Phase D RPCs — let owners look up users by email and let any race
-- viewer fetch the joined member roster without relaxing the
-- profiles.SELECT policy (own-row only).
--
-- Both functions are SECURITY DEFINER; they internally enforce that the
-- caller has visibility into the race they're querying.

CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email text)
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
    SELECT id, name, avatar_url
    FROM profiles
    WHERE lower(email) = lower(trim(p_email))
      AND id <> auth.uid()
    LIMIT 1;
$func$;

REVOKE EXECUTE ON FUNCTION public.find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_race_members(p_race_id uuid)
RETURNS TABLE(
    user_id uuid,
    role text,
    permission text,
    name text,
    avatar_url text,
    granted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
    SELECT rm.user_id, rm.role, rm.permission, p.name, p.avatar_url, rm.granted_at
    FROM race_memberships rm
    LEFT JOIN profiles p ON p.id = rm.user_id
    WHERE rm.race_id = p_race_id
      AND user_can_view_race(p_race_id)
    ORDER BY
        CASE rm.role WHEN 'owner' THEN 0 WHEN 'crew' THEN 1 WHEN 'pacer' THEN 2 ELSE 3 END,
        rm.granted_at;
$func$;

REVOKE EXECUTE ON FUNCTION public.get_race_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_race_members(uuid) TO authenticated;
