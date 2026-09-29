-- A race's runner/manager or site admin may correct a member's shared profile name.
-- Keep the profiles RLS policy self-only; this narrow function validates both
-- manager authority and the target's membership before updating the name.
CREATE OR REPLACE FUNCTION public.update_race_member_name(
    p_race_id uuid,
    p_user_id uuid,
    p_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    normalized_name text := btrim(p_name);
    saved_name text;
BEGIN
    IF auth.uid() IS NULL OR NOT public.user_can_manage_team(p_race_id) THEN
        RAISE EXCEPTION 'Not allowed to manage this race team';
    END IF;

    IF normalized_name IS NULL OR length(normalized_name) = 0 OR length(normalized_name) > 100 THEN
        RAISE EXCEPTION 'Name must be between 1 and 100 characters';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.race_memberships
        WHERE race_id = p_race_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is not a member of this race';
    END IF;

    UPDATE public.profiles
    SET name = normalized_name, updated_at = now()
    WHERE id = p_user_id
    RETURNING name INTO saved_name;

    IF saved_name IS NULL THEN
        RAISE EXCEPTION 'Member profile was not found';
    END IF;

    RETURN saved_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_race_member_name(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_race_member_name(uuid, uuid, text) TO authenticated;
