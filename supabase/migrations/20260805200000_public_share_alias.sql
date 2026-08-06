-- Optional vanity alias for private share links (replaces UUID in /{alias}?share=…).

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS public_share_alias text;

ALTER TABLE public.races
  DROP CONSTRAINT IF EXISTS races_public_share_alias_format;

ALTER TABLE public.races
  ADD CONSTRAINT races_public_share_alias_format
  CHECK (
    public_share_alias IS NULL
    OR public_share_alias ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS races_public_share_alias_lower_unique
  ON public.races (lower(public_share_alias))
  WHERE public_share_alias IS NOT NULL;

-- Managers need the alias when building the private share URL.
DROP FUNCTION IF EXISTS public.get_race_share_settings(uuid);

CREATE OR REPLACE FUNCTION public.get_race_share_settings(rid uuid)
RETURNS TABLE (
  public_share_enabled boolean,
  public_share_token text,
  public_share_alias text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.user_can_manage_team(rid)
    OR public.user_owns_race(rid)
    OR public.user_is_site_admin()
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.public_share_enabled, r.public_share_token, r.public_share_alias
  FROM public.races r
  WHERE r.id = rid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_race_share_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_race_share_settings(uuid) TO authenticated;

-- Column-level SELECT grants do not auto-extend to new columns.
GRANT SELECT (public_share_alias)
  ON TABLE public.races TO anon, authenticated;
