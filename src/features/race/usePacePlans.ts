import React from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import {
    DEFAULT_PACE_CHART_COLUMNS,
    parsePaceChartColumns,
    type PaceChartColumnsConfig,
} from './pace-chart-columns'

export interface PacePlans {
    planATimeStr: string   // HH:MM, default '24:00'
    planBTimeStr: string   // HH:MM or '' (auto-compute midpoint)
    planCBufferStr: string // HH:MM, default '00:30'
    hasCalculated: boolean
    paceChartColumns: PaceChartColumnsConfig
}

const DEFAULTS: PacePlans = {
    planATimeStr: '24:00',
    planBTimeStr: '',
    planCBufferStr: '00:30',
    hasCalculated: false,
    paceChartColumns: { ...DEFAULT_PACE_CHART_COLUMNS, order: [...DEFAULT_PACE_CHART_COLUMNS.order], hidden: [] },
}

const legacyKey = (raceId: string) => `pace_plans_${raceId}`

function readLegacyLocal(raceId: string): PacePlans | null {
    try {
        const raw = localStorage.getItem(legacyKey(raceId))
        if (!raw) return null
        const p = JSON.parse(raw)
        return {
            ...DEFAULTS,
            ...(typeof p.planATimeStr === 'string' ? { planATimeStr: p.planATimeStr } : {}),
            ...(typeof p.planBTimeStr === 'string' ? { planBTimeStr: p.planBTimeStr } : {}),
            ...(typeof p.planCBufferStr === 'string' ? { planCBufferStr: p.planCBufferStr } : {}),
            ...(typeof p.hasCalculated === 'boolean' ? { hasCalculated: p.hasCalculated } : {}),
        }
    } catch {
        return null
    }
}

function clearLegacyLocal(raceId: string) {
    try { localStorage.removeItem(legacyKey(raceId)) } catch { /* ignore */ }
}

type Row = {
    plan_a_time: string
    plan_b_time: string | null
    plan_c_buffer: string
    has_calculated: boolean
    pace_chart_columns: unknown
}

function rowToPlans(row: Row): PacePlans {
    return {
        planATimeStr: row.plan_a_time || DEFAULTS.planATimeStr,
        planBTimeStr: row.plan_b_time ?? '',
        planCBufferStr: row.plan_c_buffer || DEFAULTS.planCBufferStr,
        hasCalculated: !!row.has_calculated,
        paceChartColumns: parsePaceChartColumns(row.pace_chart_columns),
    }
}

function plansToRow(p: PacePlans, raceId: string, userId: string | null) {
    return {
        race_id: raceId,
        plan_a_time: p.planATimeStr,
        plan_b_time: p.planBTimeStr === '' ? null : p.planBTimeStr,
        plan_c_buffer: p.planCBufferStr,
        has_calculated: p.hasCalculated,
        pace_chart_columns: p.paceChartColumns,
        updated_by: userId,
        updated_at: new Date().toISOString(),
    }
}

export function usePacePlans(raceId: string) {
    const { user } = useAuth()
    const { canEdit } = usePermission(raceId)
    const [plans, setPlans] = React.useState<PacePlans>(() => ({ ...DEFAULTS }))
    const [loading, setLoading] = React.useState(true)

    // Initial load: SELECT row → fall back to legacy localStorage (one-shot migrate) → defaults.
    React.useEffect(() => {
        let cancelled = false
        setLoading(true)
        ;(async () => {
            const { data, error } = await supabase
                .from('race_pace_plans')
                .select('plan_a_time, plan_b_time, plan_c_buffer, has_calculated, pace_chart_columns')
                .eq('race_id', raceId)
                .maybeSingle()

            if (cancelled) return

            if (!error && data) {
                setPlans(rowToPlans(data as Row))
                setLoading(false)
                return
            }

            // No DB row. Try legacy localStorage migrate (only if editor; viewers read-only).
            const legacy = readLegacyLocal(raceId)
            if (legacy && canEdit) {
                const row = plansToRow(legacy, raceId, user?.id ?? null)
                const { error: upErr } = await (supabase.from('race_pace_plans') as any).upsert(row)
                if (cancelled) return
                setPlans(legacy)
                setLoading(false)
                if (!upErr) clearLegacyLocal(raceId)
                return
            }

            setPlans(legacy ?? { ...DEFAULTS })
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [raceId, canEdit, user?.id])

    // Realtime: refetch on remote change so crew sees runner's edits (and vice-versa).
    React.useEffect(() => {
        const channel = supabase
            .channel(`race_pace_plans:${raceId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'race_pace_plans', filter: `race_id=eq.${raceId}` },
                payload => {
                    const next = (payload.new ?? payload.old) as Row | undefined
                    if (next) setPlans(rowToPlans(next))
                }
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [raceId])

    const persist = async (next: PacePlans) => {
        if (!canEdit) return
        const row = plansToRow(next, raceId, user?.id ?? null)
        await (supabase.from('race_pace_plans') as any).upsert(row)
    }

    const update = (patch: Partial<PacePlans>) => {
        setPlans(prev => {
            const next = { ...prev, ...patch }
            void persist(next)
            return next
        })
    }

    return {
        plans,
        loading,
        canEdit,
        setPlanA: (v: string) => update({ planATimeStr: v, planBTimeStr: '' }),
        setPlanB: (v: string) => update({ planBTimeStr: v }),
        setPlanCBuffer: (v: string) => update({ planCBufferStr: v, planBTimeStr: '' }),
        markCalculated: () => update({ hasCalculated: true }),
        setPaceChartColumns: (v: PaceChartColumnsConfig) => update({ paceChartColumns: v }),
    }
}

export function parseTimeStr(str: string): number {
    const parts = str.split(':').map(x => { const n = Number(x); return isNaN(n) ? 0 : n })
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}

export function parseCutoffMinutes(overallCutoff: string | null | undefined): number {
    if (!overallCutoff) return 0
    if (overallCutoff.includes(':')) {
        const [h, m] = overallCutoff.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
    }
    const val = parseFloat(overallCutoff)
    return isNaN(val) ? 0 : val * 60
}

export function computePlanMinutes(
    plans: PacePlans,
    overallCutoff: string | null | undefined
): { a: number; b: number; c: number | null } {
    const a = parseTimeStr(plans.planATimeStr)
    const cutoff = parseCutoffMinutes(overallCutoff)
    const c = cutoff > 0 ? Math.max(0, cutoff - parseTimeStr(plans.planCBufferStr)) : null
    const bFallbackC = c ?? a * 1.25
    const b = plans.planBTimeStr
        ? parseTimeStr(plans.planBTimeStr)
        : (a + bFallbackC) / 2
    return { a, b, c }
}
