'use client'

import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Course, Race, TerrainNode, Waypoint } from '@/types/database'
import { calculatePacePlan, type PacePlanResult } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import {
    getVisiblePaceChartColumns,
    PACE_CHART_COLUMNS,
    type PaceChartColumnId,
    type PaceChartColumnsConfig,
} from './pace-chart-columns'
import { DropBagModal } from './DropBagModal'
import type { RunnerPacingProfile } from './runner-profile'
import { Calculator, Clock, TrendingUp, Activity, Users, Footprints, Moon, Sun, ArrowRight, Printer, AlertTriangle, Columns3, ChevronUp, ChevronDown, Eye, EyeOff, Plus, Minus } from 'lucide-react'

interface PaceCalculatorProps {
    race: Race
    course: Course
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h?: boolean
    unitsDistance?: 'miles' | 'kilometers'
    runnerProfile: RunnerPacingProfile
    onUpdateWaypointDelay?: (id: string, delay: number | null) => void
}

type StrategyMode = 'planA' | 'planB' | 'planC'

const strategyColors: Record<StrategyMode, {
    active: string
    inactive: string
    focus: string
    timeText: string
    button: string
}> = {
    planA: {
        active: 'bg-emerald-600 text-white',
        inactive: 'text-emerald-200 hover:text-white hover:bg-emerald-950/50',
        focus: 'focus:ring-emerald-500',
        timeText: 'text-emerald-300 print:text-emerald-800',
        button: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20',
    },
    planB: {
        active: 'bg-amber-500 text-neutral-950',
        inactive: 'text-amber-200 hover:text-white hover:bg-amber-950/50',
        focus: 'focus:ring-amber-500',
        timeText: 'text-amber-300 print:text-amber-800',
        button: 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-amber-900/20',
    },
    planC: {
        active: 'bg-red-600 text-white',
        inactive: 'text-red-200 hover:text-white hover:bg-red-950/50',
        focus: 'focus:ring-red-500',
        timeText: 'text-red-300 print:text-red-800',
        button: 'bg-red-600 hover:bg-red-500 shadow-red-900/20',
    },
}

export function PaceCalculator({ race, course, waypoints, terrainNodes, clock24h = false, unitsDistance = 'miles', runnerProfile, onUpdateWaypointDelay }: PaceCalculatorProps) {
    const [strategyMode, setStrategyMode] = useState<StrategyMode>('planA')
    const [plan, setPlan] = useState<ReturnType<typeof calculatePacePlan> | null>(null)
    const [calcError, setCalcError] = useState<string | null>(null)
    const [selectedDropBagWaypoint, setSelectedDropBagWaypoint] = useState<Waypoint | null>(null)

    const { plans, loading: plansLoading, canEdit, setPlanA, setPlanB, setPlanCBuffer, markCalculated, setPaceChartColumns } = usePacePlans(race.id)
    const { planATimeStr, planBTimeStr, planCBufferStr } = plans

    const { a: planAMinutes, b: planBMinutes, c: planCMinutes } = computePlanMinutes(plans, race.overall_cutoff)

    const getStrategyValue = (): number => {
        if (strategyMode === 'planA') return planAMinutes
        if (strategyMode === 'planC') return planCMinutes ?? 0
        return planBMinutes
    }

    // silent=true is used to re-render a previously-generated plan on load
    // (after refresh/revisit) without surfacing toasts or marking calculated again.
    const runCalculation = (opts?: { silent?: boolean }) => {
        const silent = opts?.silent ?? false
        setCalcError(null)

        const profile = course.elevation_samples as { distance: number; elevation: number }[] | null
        if (!profile || !Array.isArray(profile) || profile.length < 2) {
            const msg = 'No elevation data on this course. Re-upload the GPX from the Map tab.'
            setCalcError(msg)
            if (!silent) toast.error(msg)
            return
        }

        const totalDist = course.total_distance_miles || 0
        if (totalDist <= 0) {
            const msg = 'Course total distance is 0. Re-upload the GPX from the Map tab.'
            setCalcError(msg)
            if (!silent) toast.error(msg)
            return
        }

        const targetMinutes = getStrategyValue()
        if (!targetMinutes || targetMinutes <= 0 || !isFinite(targetMinutes)) {
            const msg = strategyMode === 'planC'
                ? 'Race has no overall cutoff set, so Plan C cannot be computed.'
                : 'Enter a valid total time (HH:MM), e.g. 12:30 for 12 hours 30 minutes.'
            setCalcError(msg)
            if (!silent) toast.error(msg)
            return
        }

        try {
            const result = calculatePacePlan(
                profile,
                totalDist,
                waypoints,
                terrainNodes,
                { mode: 'time', value: targetMinutes },
                race,
                clock24h,
                [],
                runnerProfile,
                runnerProfile.aidStationDefaultDelay
            )
            setPlan(result)
            if (!silent) markCalculated()
        } catch (err) {
            console.error('calculatePacePlan failed:', err)
            const msg = `Pace plan failed: ${err instanceof Error ? err.message : String(err)}`
            setCalcError(msg)
            if (!silent) toast.error(msg)
        }
    }

    // Sticky plan: once a plan has been generated (persisted via has_calculated),
    // re-render it automatically on refresh/revisit so the chart is not blank
    // until the user clicks Generate again.
    useEffect(() => {
        if (plansLoading || !plans.hasCalculated || plan || calcError) return
        runCalculation({ silent: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plansLoading, plans.hasCalculated])

    // When aid-station stop times change (inline edits in the Stop column), re-run
    // the already-displayed plan so downstream splits reflect the new dwell time.
    useEffect(() => {
        if (!plan) return
        runCalculation({ silent: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waypoints, runnerProfile.aidStationDefaultDelay])

    const isKm = unitsDistance === 'kilometers'
    const dist = course.total_distance_miles || 0
    const displayDist = isKm ? dist * 1.60934 : dist
    const targetMin = getStrategyValue()
    const currentStrategy = strategyColors[strategyMode]

    let paceStr = ''
    if (targetMin > 0 && displayDist > 0) {
        const paceMin = targetMin / displayDist
        const speed = displayDist / (targetMin / 60)
        const paceH = Math.floor(paceMin / 60)
        const paceM = Math.floor((paceMin % 60))
        const paceS = Math.round((paceMin % 1) * 60)
        // Handle 60 seconds rollover
        let finalM = paceM;
        let finalS = paceS;
        let finalH = paceH;
        if (finalS === 60) {
            finalS = 0;
            finalM += 1;
        }
        if (finalM === 60) {
            finalM = 0;
            finalH += 1;
        }

        const paceFormatted = finalH > 0
            ? `${finalH}:${finalM.toString().padStart(2, '0')}:${finalS.toString().padStart(2, '0')}`
            : `${finalM}:${finalS.toString().padStart(2, '0')}`

        paceStr = `${paceFormatted}/${isKm ? 'km' : 'mi'} (${speed.toFixed(1)} ${isKm ? 'km/h' : 'mph'})`
    }

    const formatPace = (minPerMile: number) => {
        if (!minPerMile) return '--'
        const pace = isKm ? minPerMile / 1.60934 : minPerMile
        let m = Math.floor(pace)
        let s = Math.round((pace % 1) * 60)
        if (s === 60) {
            s = 0
            m += 1
        }
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const isNight = (arrivalMinutes: number) => {
        if (!race.start_datetime) return false
        const start = new Date(race.start_datetime)
        const current = new Date(start.getTime() + arrivalMinutes * 60000)
        const hour = current.getHours()
        return hour >= 20 || hour < 6
    }

    const visibleColumns = getVisiblePaceChartColumns(plans.paceChartColumns, isKm)

    // Anyone (including public viewers) can reorder/hide columns. For editors
    // the change is persisted to the race; for viewers it stays local to their
    // session (usePacePlans.persist is a no-op without edit permission).
    const updateColumnConfig = (next: PaceChartColumnsConfig) => {
        setPaceChartColumns(next)
    }

    const toggleColumnVisibility = (id: PaceChartColumnId) => {
        const hidden = new Set(plans.paceChartColumns.hidden)
        if (hidden.has(id)) hidden.delete(id)
        else hidden.add(id)
        updateColumnConfig({ ...plans.paceChartColumns, hidden: [...hidden] })
    }

    const moveColumn = (id: PaceChartColumnId, direction: -1 | 1) => {
        const order = [...plans.paceChartColumns.order]
        const idx = order.indexOf(id)
        const target = idx + direction
        if (idx === -1 || target < 0 || target >= order.length) return
        ;[order[idx], order[target]] = [order[target], order[idx]]
        updateColumnConfig({ ...plans.paceChartColumns, order })
    }

    const isStartBag = (wp: Waypoint | undefined, arrivalName?: string) =>
        !!wp && (wp.type === 'start' || wp.mile <= 0.01 || arrivalName?.toLowerCase() === 'start')

    const renderColumnCell = (
        colId: PaceChartColumnId,
        arrival: PacePlanResult['waypointArrivals'][number],
        wp: Waypoint | undefined,
        displayName: string,
        displayMile: number,
    ) => {
        const align = colId === 'location' ? '' : 'text-right'
        const base = `px-6 py-4 print:py-2 font-mono ${align}`

        switch (colId) {
            case 'location': {
                const showBagInfo = !!wp && (wp.has_drop_bag || isStartBag(wp, arrival.name))
                return (
                    <td key={colId} className="px-6 py-4 print:py-2">
                        <div className="font-medium text-white print:text-black flex items-center gap-2">
                            <span>
                                {displayName}
                                {race.start_datetime && (
                                    isNight(arrival.arrivalTime)
                                        ? <span title="Nighttime Arrival" className="inline-flex items-center"><Moon className="w-3.5 h-3.5 text-blue-300 print:text-neutral-500 ml-1.5 print:hidden" /><span className="hidden print:inline text-neutral-500 ml-1 border px-1 rounded text-[10px]">NIGHT</span></span>
                                        : <span title="Daytime Arrival" className="inline-flex items-center print:hidden"><Sun className="w-3.5 h-3.5 text-yellow-500 ml-1.5" /></span>
                                )}
                            </span>
                            <div className="flex gap-1 ml-1 print:hidden">
                                {wp?.crew_allowed && <span title="Crew Allowed"><Users className="w-4 h-4 text-green-400" /></span>}
                                {wp?.pacer_allowed && <span title="Pacer Allowed"><Footprints className="w-4 h-4 text-blue-400" /></span>}
                                {showBagInfo && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDropBagWaypoint(wp)}
                                        title={isStartBag(wp, arrival.name) ? 'Start gear' : 'Drop bag info'}
                                        className="text-[12px] opacity-90 leading-none flex items-center justify-center pt-0.5 hover:opacity-100"
                                    >
                                        🎒
                                    </button>
                                )}
                            </div>
                        </div>
                    </td>
                )
            }
            case 'mile':
                return (
                    <td key={colId} className={`${base} text-neutral-300 print:text-neutral-800`}>
                        {(isKm ? displayMile * 1.60934 : displayMile).toFixed(2)}
                    </td>
                )
            case 'segMile':
                return (
                    <td key={colId} className={`${base} text-neutral-400 print:text-neutral-600`}>
                        {(isKm ? arrival.segmentMile * 1.60934 : arrival.segmentMile).toFixed(2)}
                    </td>
                )
            case 'segmentTime':
                return (
                    <td key={colId} className={`${base} text-neutral-400 print:text-neutral-600`}>
                        {arrival.segmentTime}
                    </td>
                )
            case 'stopTime': {
                const isAid = wp?.type === 'aid_station'
                const hasOverride = !!wp && wp.delay !== null && wp.delay !== undefined
                if (!wp || (!isAid && !hasOverride)) {
                    return <td key={colId} className={`${base} text-neutral-600`}>—</td>
                }
                const effective = hasOverride ? (wp.delay as number) : runnerProfile.aidStationDefaultDelay
                const editable = canEdit && !!onUpdateWaypointDelay
                return (
                    <td key={colId} className={`${base} text-neutral-300 print:text-neutral-600`}>
                        {editable ? (
                            <div className="flex items-center justify-end gap-1">
                                <button
                                    type="button"
                                    onClick={() => onUpdateWaypointDelay!(wp.id, Math.max(0, effective - 1))}
                                    className="print:hidden w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-white disabled:opacity-30"
                                    disabled={effective <= 0}
                                    aria-label={`Decrease stop time at ${displayName}`}
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-9 text-center tabular-nums">{effective}m</span>
                                <button
                                    type="button"
                                    onClick={() => onUpdateWaypointDelay!(wp.id, effective + 1)}
                                    className="print:hidden w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 text-white"
                                    aria-label={`Increase stop time at ${displayName}`}
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            `${effective}m`
                        )}
                    </td>
                )
            }
            case 'clockTime':
                return (
                    <td key={colId} className={`${base} font-semibold ${currentStrategy.timeText}`}>
                        {arrival.timeOfDay}
                    </td>
                )
            case 'elapsedTime':
                return (
                    <td key={colId} className={`${base} font-semibold ${currentStrategy.timeText}`}>
                        {Math.floor(arrival.arrivalTime / 60)}:{Math.floor(arrival.arrivalTime % 60).toString().padStart(2, '0')}
                    </td>
                )
            case 'segmentPace':
                return (
                    <td key={colId} className={`${base} text-neutral-400 print:text-neutral-600`}>
                        {formatPace(arrival.segmentPace)}
                    </td>
                )
            case 'overallPace':
                return (
                    <td key={colId} className={`${base} text-neutral-400 print:text-neutral-600`}>
                        {formatPace(arrival.overallPace)}
                    </td>
                )
            case 'cutoffTime':
                return (
                    <td key={colId} className={`${base} text-red-400 print:text-red-700 font-semibold max-w-[120px] truncate`} title={arrival.cutoffTime}>
                        {arrival.cutoffTime || '--'}
                    </td>
                )
            default:
                return null
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto print:block print:p-0">
            {/* Left Col: Configuration (drops below the chart on mobile) */}
            <div className="lg:col-span-1 space-y-6 print:hidden order-last lg:order-none">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-blue-500" /> Goal Setting
                    </h2>

                    {/* Mode Selector */}
                    <div className="grid grid-cols-3 gap-2 mb-6 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                        <button
                            className={`py-2 text-xs font-medium rounded transition-colors ${strategyMode === 'planA' ? strategyColors.planA.active : strategyColors.planA.inactive}`}
                            onClick={() => setStrategyMode('planA')}
                        >
                            Plan A (Goal)
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded transition-colors ${strategyMode === 'planB' ? strategyColors.planB.active : strategyColors.planB.inactive}`}
                            onClick={() => setStrategyMode('planB')}
                        >
                            Plan B (Mid)
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded transition-colors ${strategyMode === 'planC' ? strategyColors.planC.active : strategyColors.planC.inactive}`}
                            onClick={() => setStrategyMode('planC')}
                        >
                            Plan C (Cutoff)
                        </button>
                    </div>

                    {/* Main Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-neutral-400 mb-2">
                            {strategyMode === 'planA' ? 'Goal Total Time (HH:MM)' :
                                strategyMode === 'planC' ? 'Safety Buffer Before Cutoff (HH:MM)' :
                                    'Goal Total Time (calculated midpoint)'}
                        </label>
                        {strategyMode === 'planC' && !race.overall_cutoff && (
                            <div className="text-red-400 text-xs mb-2">Race has no overall cutoff time set.</div>
                        )}
                        <input
                            type="text"
                            className={`w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white text-lg font-mono placeholder-neutral-600 focus:ring-2 ${currentStrategy.focus} outline-none`}
                            placeholder={strategyMode === 'planA' ? "e.g. 24:00" : strategyMode === 'planC' ? "e.g. 00:30" : `${Math.floor(planBMinutes / 60)}:${(Math.floor(planBMinutes % 60)).toString().padStart(2, '0')}`}
                            value={strategyMode === 'planA' ? planATimeStr : strategyMode === 'planC' ? planCBufferStr : (planBTimeStr || `${Math.floor(planBMinutes / 60)}:${(Math.floor(planBMinutes % 60)).toString().padStart(2, '0')}`)}
                            onChange={(e) => {
                                if (strategyMode === 'planA') { setPlanA(e.target.value) }
                                else if (strategyMode === 'planC') { setPlanCBuffer(e.target.value) }
                                else if (strategyMode === 'planB') setPlanB(e.target.value);
                            }}
                        />
                        <div className="mt-1.5 text-xs text-neutral-500">
                            {strategyMode === 'planC'
                                ? 'How many hours earlier than the cutoff you want to finish (e.g. 00:30 = 30 min buffer).'
                                : 'Total hours and minutes to complete the race — not a clock time. E.g. 20:30 = 20 hours 30 minutes of running, not 8:30 PM.'}
                        </div>

                        {paceStr && (
                            <div className="mt-2 text-sm text-blue-400 font-mono">
                                Pace Required: {paceStr}
                            </div>
                        )}

                        {strategyMode === 'planC' && race.overall_cutoff && (
                            <div className="mt-2 text-xs text-neutral-500">
                                Race Cutoff: {race.overall_cutoff}
                            </div>
                        )}
                    </div>



                    <button
                        onClick={() => runCalculation()}
                        className={`w-full text-white font-bold py-3 rounded-lg transition-colors shadow-lg ${currentStrategy.button}`}
                    >
                        Generate Plan
                    </button>
                </div>

                {plan && (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Columns3 className="w-5 h-5 text-blue-500" /> Print Columns
                        </h2>
                        <p className="text-xs text-neutral-500 mb-4">
                            Choose which columns appear in the table and printout. Drag order with arrows.
                        </p>
                        <div className="space-y-2">
                            {plans.paceChartColumns.order.map((colId, index) => {
                                const def = PACE_CHART_COLUMNS.find(c => c.id === colId)
                                if (!def) return null
                                const hidden = plans.paceChartColumns.hidden.includes(colId)
                                const label = colId === 'mile'
                                    ? (isKm ? 'Km' : 'Mile')
                                    : colId === 'segMile'
                                        ? `Seg ${isKm ? 'Km' : 'Mile'}`
                                        : def.label
                                return (
                                    <div key={colId} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${hidden ? 'border-neutral-800/50 opacity-60' : 'border-neutral-800'}`}>
                                        <div className="flex flex-col">
                                            <button onClick={() => moveColumn(colId, -1)} disabled={index === 0} className="text-neutral-500 hover:text-white disabled:opacity-30">
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => moveColumn(colId, 1)} disabled={index === plans.paceChartColumns.order.length - 1} className="text-neutral-500 hover:text-white disabled:opacity-30">
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <span className="flex-1 text-sm text-neutral-300">{label}</span>
                                        <button onClick={() => toggleColumnVisibility(colId)} className="text-neutral-500 hover:text-white">
                                            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Col: Results (shown first on mobile) */}
            <div className="lg:col-span-2 space-y-6 print:block order-first lg:order-none">
                {plan ? (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
                            <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-800">
                                <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Total Time
                                </div>
                                <div className="text-2xl font-black text-white font-mono">
                                    {Math.floor(plan.totalTime / 60)}:{Math.floor(plan.totalTime % 60).toString().padStart(2, '0')}
                                </div>
                            </div>
                            <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-800">
                                <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Activity className="w-3 h-3" /> Avg Pace
                                </div>
                                <div className="text-2xl font-black text-white font-mono">
                                    {formatPace(plan.avgPace)}
                                </div>
                                <div className="text-xs text-neutral-500">/{isKm ? 'km' : 'mi'} (Moving)</div>
                            </div>
                            <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-800">
                                <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Norm. Pace
                                </div>
                                <div className="text-2xl font-black text-blue-400 font-mono">
                                    {formatPace(plan.avgGap)}
                                </div>
                                <div className="text-xs text-neutral-500">/{isKm ? 'km' : 'mi'} (GAP)</div>
                            </div>
                            {/* Extra slot */}
                        </div>

                        {/* Splits Table */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl mt-6 print:border-none print:shadow-none print:bg-white text-black print:text-black">
                            <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between print:border-neutral-300">
                                <h3 className="font-bold text-white print:text-black print:hidden">Splits</h3>
                                <h3 className="hidden font-bold text-xl mb-2 text-black print:block">{race.name} - Pace Plan</h3>

                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-neutral-500 flex items-center gap-1 md:hidden print:hidden">
                                        Swipe <ArrowRight className="w-3 h-3" />
                                    </div>
                                    <button
                                        onClick={() => window.print()}
                                        className="print:hidden flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-medium border border-neutral-700 hover:border-neutral-600"
                                    >
                                        <Printer className="w-4 h-4" />
                                        Print
                                    </button>
                                </div>
                            </div>
                            <div
                                className="overflow-x-auto print:overflow-visible"
                                style={{ overflowY: 'clip' }}
                            >
                                <table className="w-full text-sm text-left print:text-xs">
                                    <thead
                                        className="bg-neutral-950 text-neutral-400 print:bg-neutral-100 print:text-black uppercase text-xs font-semibold sticky top-0 z-10 print:static shadow-sm shadow-neutral-950"
                                    >
                                        <tr>
                                            {visibleColumns.map(col => (
                                                <th
                                                    key={col.id}
                                                    className={`px-6 py-3 ${col.align === 'right' ? 'text-right' : ''}`}
                                                >
                                                    {col.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {plan.waypointArrivals.map((arrival) => {
                                            // Synthetic Start/Finish rows have no DB waypoint; fall back to arrival's own name/mile.
                                            const wp = waypoints.find(w => w.id === arrival.waypointId)
                                            const displayName = wp?.name ?? arrival.name
                                            const displayMile = wp?.mile ?? arrival.mile

                                            return (
                                                <tr key={arrival.waypointId} className="hover:bg-neutral-800/50 transition-colors print:border-b print:border-neutral-200">
                                                    {visibleColumns.map(col =>
                                                        renderColumnCell(col.id, arrival, wp, displayName, displayMile)
                                                    )}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : calcError ? (
                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-red-900/60 bg-red-950/20 rounded-xl p-12">
                        <AlertTriangle className="w-12 h-12 mb-4 text-red-400" />
                        <p className="text-lg font-medium text-red-300 text-center max-w-md">{calcError}</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl p-12">
                        <Calculator className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">Configure your goals to generate a plan</p>
                    </div>
                )}
            </div>

            {selectedDropBagWaypoint && (
                <DropBagModal
                    waypoint={selectedDropBagWaypoint}
                    race={race}
                    canEdit={canEdit}
                    contentsOnly
                    arrivalTime={plan?.waypointArrivals.find(a => a.waypointId === selectedDropBagWaypoint.id)}
                    isNight={
                        !!plan?.waypointArrivals.find(a => a.waypointId === selectedDropBagWaypoint.id) &&
                        isNight(plan.waypointArrivals.find(a => a.waypointId === selectedDropBagWaypoint.id)!.arrivalTime)
                    }
                    onClose={() => setSelectedDropBagWaypoint(null)}
                />
            )}
        </div >
    )
}
