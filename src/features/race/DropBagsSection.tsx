import { useState, useEffect } from 'react'
import { Race, Course, Waypoint, TerrainNode } from '@/types/database'
import { calculatePacePlan } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { Backpack, Clock, Sun, Moon, Info, Printer, List, ChevronDown, ChevronUp, Target, PackageCheck, Pencil } from 'lucide-react'
import { DropBagModal, type DropBagCoverageRow } from './DropBagModal'
import { DropBagNotes } from './DropBagNotes'
import { DropBagTemplateEditor } from './DropBagTemplateEditor'
import { usePermission } from '@/features/auth/usePermission'
import type { RunnerPacingProfile } from './runner-profile'
import {
    getBagKind,
    getBagKindLabel,
    getDropBagTemplateForKind,
    getDropBagEditorItems,
    hasSavedBagPlan,
    parseDropBagTemplate,
} from './drop-bag-shared'
import SunCalc from 'suncalc'

interface DropBagsSectionProps {
    race: Race
    course: Course | null
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h?: boolean
    runnerProfile: RunnerPacingProfile
    onGoToPacePlan: () => void
}

const COURSE_ORDER_EPSILON = 1e-6
const AID_STATION_TYPES = new Set(['aid_station', 'drop_bag', 'water_only', 'medical', 'crew', 'pacer'])

const compareCourseOrder = (a: Waypoint, b: Waypoint) =>
    (a.mile - b.mile) || (a.order_index - b.order_index) || a.name.localeCompare(b.name)

const isAfterWaypoint = (candidate: Waypoint, current: Waypoint) =>
    candidate.mile > current.mile + COURSE_ORDER_EPSILON ||
    (Math.abs(candidate.mile - current.mile) <= COURSE_ORDER_EPSILON && candidate.order_index > current.order_index)

const isAidStationWaypoint = (waypoint: Waypoint) =>
    AID_STATION_TYPES.has(waypoint.type) ||
    !!waypoint.has_drop_bag ||
    !!waypoint.crew_allowed ||
    !!waypoint.pacer_allowed

const formatDuration = (minutes: number) => {
    if (!Number.isFinite(minutes)) return null
    const rounded = Math.max(0, Math.round(minutes))
    const hours = Math.floor(rounded / 60)
    const mins = rounded % 60
    return hours > 0 ? `${hours}h ${mins.toString().padStart(2, '0')}m` : `${mins}m`
}

export function DropBagsSection({ race, course, waypoints, terrainNodes, clock24h = false, runnerProfile, onGoToPacePlan }: DropBagsSectionProps) {
    const { canEditRaceSettings } = usePermission(race.id, race.race_director_user_id)
    const canWriteDropBags = canEditRaceSettings
    const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null)
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true)
    const [collapsedStations, setCollapsedStations] = useState<Record<string, boolean>>({})

    const toggleStation = (wpId: string) => {
        setCollapsedStations(prev => ({
            ...prev,
            [wpId]: !prev[wpId]
        }))
    }

    const sortedWaypoints = [...waypoints].sort(compareCourseOrder)
    const bagWaypoints = sortedWaypoints
        .filter(wp => {
            const kind = getBagKind(wp)
            if (!kind) return false
            return kind !== 'crew' || canWriteDropBags || hasSavedBagPlan(wp)
        })
    const aidStationWaypoints = sortedWaypoints.filter(isAidStationWaypoint)

    const { plans } = usePacePlans(race.id)
    const { a: planAMinutes } = computePlanMinutes(plans, race.overall_cutoff)

    // Defer the Plan A simulation off the click path: it runs a bisection over
    // thousands of samples, which can otherwise make the tab feel unresponsive.
    // useEffect + setTimeout(0) yields so the new tab paints before compute starts.
    type Plan = ReturnType<typeof calculatePacePlan> | null
    const [computed, setComputed] = useState<{ A: Plan } | null>(null)

    useEffect(() => {
        if (!plans.hasCalculated || !course?.elevation_samples) {
            const handle = setTimeout(() => setComputed(null), 0)
            return () => clearTimeout(handle)
        }
        const handle = setTimeout(() => {
            const samples = course.elevation_samples as { distance: number; elevation: number }[]
            const totalDist = course.total_distance_miles || 0
            const build = (minutes: number): Plan =>
                minutes > 0
                    ? calculatePacePlan(samples, totalDist, waypoints, terrainNodes, { mode: 'time', value: minutes }, race, clock24h, [], runnerProfile, runnerProfile.aidStationDefaultDelay)
                    : null
            setComputed({
                A: build(planAMinutes),
            })
        }, 0)
        return () => clearTimeout(handle)
    }, [plans.hasCalculated, runnerProfile, planAMinutes, course, waypoints, terrainNodes, race, clock24h])

    const planA = computed?.A ?? null
    const planOptions = [
        { label: 'A', plan: planA, color: 'text-emerald-400' },
    ]

    const isNight = (arrivalMinutes: number, wpLat: number, wpLon: number) => {
        if (!race.start_datetime) return false
        const start = new Date(race.start_datetime)
        const current = new Date(start.getTime() + arrivalMinutes * 60000)

        let isNightTime = false
        const hour = current.getHours()
        isNightTime = hour >= 20 || hour < 6 // fallback

        if (wpLat && wpLon) {
            const times = SunCalc.getTimes(current, wpLat, wpLon)
            if (times.dusk && times.dawn) {
                isNightTime = current > times.dusk || current < times.dawn
            }
        }
        return isNightTime
    }

    // Determine overall conditions
    const isHot = parseInt(race.avg_temp_high || '0') >= 80
    const isCold = parseInt(race.avg_temp_low || '100') <= 40
    const hasConditions = isHot || isCold || !!race.weather_notes
    const dropBagTemplate = parseDropBagTemplate(race.drop_bag_template)

    const getWaypointArrival = (wp: Waypoint) =>
        planA?.waypointArrivals.find(a => a.waypointId === wp.id)

    const getPlanArrival = (plan: Plan, wp: Waypoint) =>
        plan?.waypointArrivals.find(a => a.waypointId === wp.id)

    const getWaypointIsNight = (wp: Waypoint) => {
        const arrival = getWaypointArrival(wp)
        return arrival ? isNight(arrival.arrivalTime, wp.lat, wp.lon) : false
    }

    const getWaypointItems = (wp: Waypoint) => {
        const kind = getBagKind(wp) ?? 'official'
        const template = getDropBagTemplateForKind(kind, dropBagTemplate)
        return getDropBagEditorItems(wp.drop_bag_items, template, {
            isNight: getWaypointIsNight(wp),
            isHot,
            isCold,
        })
    }

    const getNextAidStation = (wp: Waypoint) =>
        aidStationWaypoints.find(candidate => isAfterWaypoint(candidate, wp)) ?? null

    const getNextBagWaypoint = (wp: Waypoint) =>
        bagWaypoints.find(candidate => isAfterWaypoint(candidate, wp)) ?? null

    const getBagResourceLabel = (target: Waypoint | null) =>
        target && getBagKind(target) === 'crew'
            ? 'Next crew'
            : 'Next bag'

    const buildCoverageRow = (current: Waypoint, label: string, target: Waypoint | null, labelClass: string): DropBagCoverageRow => {
        const currentPlanA = getPlanArrival(planA, current)
        return {
            label,
            labelClass,
            targetName: target?.name ?? null,
            targetMile: target?.mile ?? null,
            milesUntil: target ? Math.max(0, target.mile - current.mile) : null,
            plans: planOptions.map(({ label: planLabel, plan, color }) => {
                const arrival = target ? getPlanArrival(plan, target) : undefined
                return {
                    label: planLabel,
                    colorClass: color,
                    timeOfDay: arrival?.timeOfDay ?? null,
                    duration: arrival && currentPlanA ? formatDuration(arrival.arrivalTime - currentPlanA.arrivalTime) : null,
                }
            }),
        }
    }

    const getCoverageRows = (wp: Waypoint) => {
        const nextBag = getNextBagWaypoint(wp)
        const nextBagKind = nextBag ? getBagKind(nextBag) : null
        return [
            buildCoverageRow(wp, 'Next aid', getNextAidStation(wp), 'text-blue-400'),
            buildCoverageRow(wp, getBagResourceLabel(nextBag), nextBag, nextBagKind === 'crew' ? 'text-emerald-400' : 'text-orange-400'),
        ]
    }

    const renderNextEtaRow = (row: DropBagCoverageRow) => (
        <div className="flex items-start gap-3 text-xs">
            <div className={`w-20 shrink-0 whitespace-nowrap font-bold uppercase tracking-wide ${row.labelClass}`}>
                {row.label}
            </div>
            {row.targetName ? (
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-neutral-200 font-medium">{row.targetName}</span>
                        <span className="shrink-0 font-mono text-neutral-500">Mile {row.targetMile?.toFixed(1)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-neutral-400">
                        {row.milesUntil !== null && (
                            <span className="font-mono">+{row.milesUntil.toFixed(1)} mi</span>
                        )}
                        {row.plans.map(plan => (
                            <span key={plan.label} className="flex flex-wrap items-baseline gap-x-1.5">
                                <span className={`font-mono font-semibold ${plan.colorClass}`}>{plan.timeOfDay ?? '—'}</span>
                                <span className="text-neutral-500">Estimated arrival time</span>
                                {plan.duration && <span className="text-neutral-500"> · in {plan.duration}</span>}
                            </span>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-neutral-600">None ahead</div>
            )}
        </div>
    )

    if (bagWaypoints.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl my-6">
                <Backpack className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-xl font-medium text-white mb-2">No bag points configured</h3>
                <p>Go to the map tab and edit aid stations to enable drop bags or crew access.</p>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 animate-in fade-in duration-500 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 items-start relative">

            <div className="flex-1 space-y-6 min-w-0 w-full print:hidden">

                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Backpack className="w-6 h-6 text-orange-500 print:hidden" />
                        <span className="print:hidden">Start, Drop & Crew Bag Planner</span>
                        <span className="hidden print:inline-block">Start, Drop & Crew Bags - {race.name}</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <DropBagTemplateEditor race={race} canEdit={canEditRaceSettings} />
                        <button
                            onClick={() => window.print()}
                            className="print:hidden flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                        >
                            <Printer className="w-4 h-4" />
                            Print List
                        </button>
                    </div>
                </div>

                {hasConditions && (
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 mb-6 flex gap-3">
                        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-neutral-300">
                            <strong className="text-white block mb-1">Weather Context for Bags</strong>
                            {isHot && <div className="text-orange-400">• High temps projected ({race.avg_temp_high}°): Plan for ice bandanas and extra fluids/electrolytes.</div>}
                            {isCold && <div className="text-blue-300">• Low temps projected ({race.avg_temp_low}°): Consider packing layers, gloves, and dry socks.</div>}
                            {race.weather_notes && <div className="text-neutral-400 mt-1 italic">{race.weather_notes}</div>}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {bagWaypoints.map(wp => {
                        const kind = getBagKind(wp) ?? 'official'
                        const isStartBag = kind === 'start'
                        const isCrewBag = kind === 'crew'
                        const hasBagPlan = hasSavedBagPlan(wp)
                        const coverageRows = getCoverageRows(wp)
                        const cardClass = isCrewBag
                            ? 'bg-emerald-950/15 border-emerald-900/70 hover:border-emerald-500/60 hover:shadow-emerald-950/30'
                            : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:shadow-black/50'
                        const labelClass = isCrewBag
                            ? 'border-emerald-700/60 bg-emerald-950/70 text-emerald-200'
                            : 'border-orange-900/60 bg-orange-950/40 text-orange-200'
                        return (
                            <div
                                key={wp.id}
                                className={`border rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl group flex flex-col ${cardClass}`}
                                onClick={() => setSelectedWaypoint(wp)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-[0.18em] border rounded-full px-2 py-0.5 ${labelClass}`}>
                                                {getBagKindLabel(kind)}
                                            </span>
                                            {isCrewBag && !hasBagPlan && (
                                                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                                                    Available
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-orange-400 transition-colors">
                                            {isStartBag ? 'Start' : wp.name}
                                        </h3>
                                        <div className="text-neutral-500 text-sm font-mono">
                                            Mile {wp.mile.toFixed(1)}
                                            {isCrewBag && <span className="ml-2 text-emerald-400 font-sans">crew access</span>}
                                        </div>
                                    </div>
                                    <div className={`w-10 h-10 rounded-full bg-neutral-950 flex items-center justify-center border transition-colors ${isCrewBag ? 'border-emerald-900 group-hover:border-emerald-500/70' : 'border-neutral-800 group-hover:border-orange-500/50'}`}>
                                        {isStartBag
                                            ? <span className="text-[10px] font-bold text-emerald-300 leading-none">Start</span>
                                            : isCrewBag
                                                ? <PackageCheck className="w-5 h-5 text-emerald-300 transition-colors" />
                                                : <Backpack className="w-5 h-5 text-neutral-400 group-hover:text-orange-500 transition-colors" />}
                                    </div>
                                </div>

                                <div className="space-y-3 flex-1">
                                    {!plans.hasCalculated ? (
                                        <div className="text-center py-3 space-y-2">
                                            <p className="text-sm text-neutral-500">Set your goal time to see ETAs.</p>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onGoToPacePlan() }}
                                                className="text-sm text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 mx-auto transition-colors"
                                            >
                                                <Target className="w-4 h-4" />
                                                Go to Pace Plan
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {[
                                                ...planOptions,
                                            ].map(({ label, plan: p, color }) => {
                                                const arrival = p?.waypointArrivals.find(a => a.waypointId === wp.id)
                                                return (
                                                    <div key={label} className="flex items-center gap-2 text-sm bg-neutral-950/50 px-2 py-1.5 rounded border border-neutral-800">
                                                        <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                                        <span className={`font-mono font-semibold ${color}`}>{arrival?.timeOfDay ?? '—'}</span>
                                                        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">Estimated arrival time</span>
                                                        {arrival && race.start_datetime && (
                                                            isNight(arrival.arrivalTime, wp.lat, wp.lon)
                                                                ? <Moon className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                                                                : <Sun className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {plans.hasCalculated && (
                                        <div className="border-t border-neutral-800 pt-3 space-y-2">
                                            {coverageRows.map(row => renderNextEtaRow(row))}
                                        </div>
                                    )}

                                    {wp.drop_bag_name && (
                                        <div className="mt-2 p-2 bg-neutral-950/50 rounded border border-neutral-800">
                                            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">
                                                {isStartBag ? 'Start Gear' : isCrewBag ? 'Crew Bag' : 'Bag Name'}
                                            </div>
                                            <div className="text-sm text-neutral-300 font-medium">
                                                {wp.drop_bag_name}
                                            </div>
                                        </div>
                                    )}
                                    <DropBagNotes waypoint={wp} className="mt-2" />
                                </div>
                            </div>
                        )
                    })}
                </div>

                {selectedWaypoint && (
                    <DropBagModal
                        waypoint={selectedWaypoint}
                        race={race}
                        canEdit={canWriteDropBags}
                        arrivalTime={planA?.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)}
                        coverageRows={plans.hasCalculated ? getCoverageRows(selectedWaypoint) : []}
                        isNight={
                            planA?.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)
                                ? isNight(planA.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)!.arrivalTime, selectedWaypoint.lat, selectedWaypoint.lon)
                                : false
                        }
                        onClose={() => setSelectedWaypoint(null)}
                    />
                )}
            </div>

            {/* Side Panel */}
            <div className={`w-full shrink-0 print:w-full print:block ${isSidePanelOpen ? 'lg:w-80' : 'lg:w-auto'}`}>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl sticky top-24 overflow-hidden print:border-none print:bg-transparent">
                    <button
                        onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
                        className="w-full p-4 flex items-center justify-between text-white font-bold bg-neutral-800/50 hover:bg-neutral-800 transition-colors print:hidden"
                    >
                        <div className="flex items-center gap-2">
                            <List className="w-5 h-5 text-orange-500" />
                            {isSidePanelOpen ? <span>All Bags</span> : <span className="hidden lg:hidden">All Bags</span>}
                        </div>
                        {isSidePanelOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>

                    <h3 className="hidden print:block text-xl font-bold text-neutral-800 mb-4 border-b border-neutral-300 pb-2">Start, Drop & Crew Bag Contents</h3>

                    <div className={`${isSidePanelOpen ? 'block' : 'hidden'} print:block p-4 space-y-6 max-h-[calc(100vh-150px)] overflow-y-auto print:max-h-none print:overflow-visible`}>
                        {bagWaypoints.map(wp => {
                            const kind = getBagKind(wp) ?? 'official'
                            const isStartBag = kind === 'start'
                            const isCrewBag = kind === 'crew'
                            const items = getWaypointItems(wp)
                            const packedItems = items.filter(i => i.checked)
                            if (!canWriteDropBags && packedItems.length === 0) return null

                            const isCollapsed = collapsedStations[wp.id]

                            return (
                                <div key={wp.id} className={`print:break-inside-avoid ${packedItems.length === 0 ? 'print:hidden' : ''}`}>
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <button
                                            type="button"
                                            className={`min-w-0 flex items-center gap-1 text-left text-sm font-bold text-neutral-300 print:text-neutral-800 hover:text-white transition-colors ${isCrewBag ? 'text-emerald-400' : 'text-orange-400'}`}
                                            onClick={() => toggleStation(wp.id)}
                                        >
                                            {isCollapsed ? <ChevronDown className="w-4 h-4 print:hidden" /> : <ChevronUp className="w-4 h-4 print:hidden" />}
                                            <span className="min-w-0 truncate text-neutral-300">
                                                {isStartBag ? 'Start' : wp.name}
                                                {wp.drop_bag_name ? ` (${wp.drop_bag_name})` : ''}
                                                {isCrewBag ? ' · Crew bag' : ''}
                                            </span>
                                        </button>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-neutral-500 print:text-neutral-600 font-mono text-xs">Mile {wp.mile.toFixed(1)}</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedWaypoint(wp)}
                                                className={`print:hidden flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold transition-colors ${canWriteDropBags
                                                    ? isCrewBag
                                                        ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50'
                                                        : 'border-orange-900/60 bg-orange-950/40 text-orange-200 hover:bg-orange-900/40'
                                                    : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-800'
                                                    }`}
                                                title={canWriteDropBags ? 'Edit bag contents' : 'View bag contents'}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                                {canWriteDropBags ? 'Edit' : 'View'}
                                            </button>
                                        </div>
                                    </div>
                                    {!isCollapsed && (
                                        <div className="space-y-2">
                                            {packedItems.length > 0 ? (
                                                <ul className="space-y-1 pl-5">
                                                    {packedItems.map((item, idx) => (
                                                        <li key={idx} className="text-sm text-neutral-400 print:text-neutral-700 flex items-start gap-2">
                                                            <span className={`${isCrewBag ? 'text-emerald-500/60' : 'text-orange-500/50'} print:text-neutral-400 mt-1`}>&bull;</span>
                                                            <span className="leading-snug">
                                                                {item.quantity && <span className="text-neutral-300 print:text-neutral-900 font-medium mr-1">{item.quantity}x</span>}
                                                                {item.text}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <div className="pl-5 text-sm italic text-neutral-600 print:hidden">
                                                    No items packed yet.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {bagWaypoints.every(wp => {
                            const items = getWaypointItems(wp)
                            return !canWriteDropBags && items.filter(i => i.checked).length === 0;
                        }) && (
                                <div className="text-sm text-neutral-500 italic text-center py-4 print:hidden">
                                    {canWriteDropBags ? 'Open a bag point to add items.' : 'No items packed yet.'}
                                </div>
                            )}
                    </div>
                </div>
            </div>

        </div>
    )
}
