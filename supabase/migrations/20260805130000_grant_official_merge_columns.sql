-- Fix "permission denied for table races" (42501) on broad race selects.
--
-- 20260728_restrict_public_share_token replaced table-level SELECT on races
-- with a per-column GRANT (to keep public_share_token private). Column-level
-- grants do NOT auto-extend to columns added later, so the official-merge
-- columns added in 20260805120000_opt_in_official_merge
-- (official_revision, merged_official_revision) were never selectable by
-- anon/authenticated. Because src/lib/race-select.ts (RACE_SELECT) requests
-- them, PostgREST returned 42501 and the race list failed to load.
--
-- Grant SELECT on just those two columns to restore access. GRANT is idempotent.

GRANT SELECT (official_revision, merged_official_revision)
  ON TABLE public.races TO anon, authenticated;
