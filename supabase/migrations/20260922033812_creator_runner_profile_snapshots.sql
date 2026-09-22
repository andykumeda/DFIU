-- Keep the event creator's runner profile as the single pacing input for the
-- event. The snapshot is intentionally separate from race_pace_plans because
-- those rows can be visible through read-only share links; runner profile data
-- is restricted to authenticated race members, the creator, and site admins.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE public.race_runner_profiles (
    race_id uuid PRIMARY KEY REFERENCES public.races(id) ON DELETE CASCADE,
    runner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    runner_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.race_runner_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.race_runner_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.race_runner_profiles TO authenticated;

CREATE POLICY race_runner_profiles_team_select
ON public.race_runner_profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.races r
        WHERE r.id = public.race_runner_profiles.race_id
          AND r.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.race_memberships rm
        WHERE rm.race_id = public.race_runner_profiles.race_id
          AND rm.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1
        FROM public.site_admins sa
        WHERE sa.user_id = (SELECT auth.uid())
    )
);

CREATE OR REPLACE FUNCTION private.snapshot_race_creator_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.race_runner_profiles (
        race_id,
        runner_user_id,
        runner_profile,
        updated_at
    )
    SELECT
        NEW.id,
        NEW.user_id,
        COALESCE(p.runner_profile, '{}'::jsonb),
        now()
    FROM public.profiles p
    WHERE p.id = NEW.user_id
    ON CONFLICT (race_id) DO UPDATE
    SET
        runner_user_id = EXCLUDED.runner_user_id,
        runner_profile = EXCLUDED.runner_profile,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_creator_profile_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.race_runner_profiles
    SET
        runner_profile = COALESCE(NEW.runner_profile, '{}'::jsonb),
        updated_at = now()
    WHERE runner_user_id = NEW.id;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_race_creator_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_creator_profile_snapshots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS snapshot_race_creator_profile ON public.races;
CREATE TRIGGER snapshot_race_creator_profile
AFTER INSERT OR UPDATE OF user_id ON public.races
FOR EACH ROW
EXECUTE FUNCTION private.snapshot_race_creator_profile();

DROP TRIGGER IF EXISTS sync_creator_profile_snapshots ON public.profiles;
CREATE TRIGGER sync_creator_profile_snapshots
AFTER UPDATE OF runner_profile ON public.profiles
FOR EACH ROW
WHEN (OLD.runner_profile IS DISTINCT FROM NEW.runner_profile)
EXECUTE FUNCTION private.sync_creator_profile_snapshots();

INSERT INTO public.race_runner_profiles (
    race_id,
    runner_user_id,
    runner_profile,
    updated_at
)
SELECT
    r.id,
    r.user_id,
    COALESCE(p.runner_profile, '{}'::jsonb),
    now()
FROM public.races r
JOIN public.profiles p ON p.id = r.user_id
ON CONFLICT (race_id) DO UPDATE
SET
    runner_user_id = EXCLUDED.runner_user_id,
    runner_profile = EXCLUDED.runner_profile,
    updated_at = EXCLUDED.updated_at;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'race_runner_profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.race_runner_profiles;
    END IF;
END;
$$;

COMMENT ON TABLE public.race_runner_profiles IS
    'Team-only snapshot of the event creator profile used for all event pace calculations.';
