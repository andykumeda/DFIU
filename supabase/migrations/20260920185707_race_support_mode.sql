-- Personal-plan support preference; keep existing plans and stored team/bag data intact.
ALTER TABLE public.races ADD COLUMN support_mode text NOT NULL DEFAULT 'both'
    CONSTRAINT races_support_mode_check CHECK (support_mode IN ('solo', 'crew', 'pacer', 'both'));
COMMENT ON COLUMN public.races.support_mode IS 'Personal plan support: solo, crew, pacer, or both. Does not change team permissions or course access rules.';
-- Races deliberately uses column-level SELECT grants to protect share tokens.
GRANT SELECT (support_mode) ON public.races TO anon, authenticated;
