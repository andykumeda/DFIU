import React from 'react'

export interface PacePlans {
    planATimeStr: string   // HH:MM, default '24:00'
    planBTimeStr: string   // HH:MM or '' (auto-compute midpoint)
    planCBufferStr: string // HH:MM, default '00:30'
    hasCalculated: boolean
}

const DEFAULTS: PacePlans = {
    planATimeStr: '24:00',
    planBTimeStr: '',
    planCBufferStr: '00:30',
    hasCalculated: false,
}

function storageKey(raceId: string) {
    return `pace_plans_${raceId}`
}

function load(raceId: string): PacePlans {
    try {
        const raw = localStorage.getItem(storageKey(raceId))
        if (!raw) return { ...DEFAULTS }
        return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
        return { ...DEFAULTS }
    }
}

function save(raceId: string, plans: PacePlans) {
    localStorage.setItem(storageKey(raceId), JSON.stringify(plans))
}

export function usePacePlans(raceId: string) {
    const [plans, setPlans] = React.useState<PacePlans>(() => load(raceId))

    const update = (patch: Partial<PacePlans>) => {
        setPlans(prev => {
            const next = { ...prev, ...patch }
            save(raceId, next)
            return next
        })
    }

    return {
        plans,
        setPlanA: (v: string) => update({ planATimeStr: v, planBTimeStr: '' }),
        setPlanB: (v: string) => update({ planBTimeStr: v }),
        setPlanCBuffer: (v: string) => update({ planCBufferStr: v, planBTimeStr: '' }),
        markCalculated: () => update({ hasCalculated: true }),
    }
}

export function parseTimeStr(str: string): number {
    const [h, m] = str.split(':').map(Number)
    return ((h || 0) * 60) + (m || 0)
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
