-- After 20260728_restrict_public_share_token.sql, races uses column-level SELECT
-- grants (table SELECT was revoked so public_share_token stays private).
-- Columns added later in 20260805120000_opt_in_official_merge.sql were never
-- granted, so any RACE_SELECT including them fails with:
--   permission denied for table races
-- for both anon and authenticated roles.

GRANT SELECT (
  official_revision,
  merged_official_revision
) ON TABLE public.races TO anon, authenticated;
