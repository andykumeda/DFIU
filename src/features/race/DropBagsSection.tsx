import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Race, Course, Waypoint, TerrainNode } from '@/types/database'
import { calculatePacePlan } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { Backpack, Clock, Sun, Moon, Info, Printer, List, ChevronDown, ChevronUp, Target, Pencil } from 'lucide-react'
import { DropBagModal, type DropBagCoverageRow } from './DropBagModal'
import { DropBagCoverage } from './DropBagCoverage'
import { formatBagCutoff } from './drop-bag-cutoff'
import { DropBagTemplateEditor } from './DropBagTemplateEditor'
import { usePermission } from '@/features/auth/usePermission'
import type { RunnerPacingProfile } from './runner-profile'
import {
    getBagKind,
    getBagKindLabel,
    getDropBagTemplateForKind,
    getDropBagEditorItems,
    getDropBagNotes,
    hasSavedBagPlan,
    parseDropBagTemplate,
} from './drop-bag-shared'
import { getRaceSupport, isVisibleBag } from './race-support'
import { formatPlanALabel } from './plan-label'
import SunCalc from 'suncalc'
import { getBagLighting, getBagLightingMessage } from './drop-bag-lighting'
import type { PrintableDropBag } from './drop-bag-pdf'

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
    const { canEditRaceSettings } = usePermission(race.id, race.race_director_user_id, race.is_official)
    const canWriteDropBags = canEditRaceSettings
    const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null)
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true)
    const [collapsedStations, setCollapsedStations] = useState<Record<string, boolean>>({})
    const [printOpen, setPrintOpen] = useState(false)
    const [printBusy, setPrintBusy] = useState(false)
    const [printError, setPrintError] = useState<string | null>(null)
    const [printPdf, setPrintPdf] = useState<{ url: string; filename: string } | null>(null)

    useEffect(() => () => {
        if (printPdf) URL.revokeObjectURL(printPdf.url)
    }, [printPdf])

    const toggleStation = (wpId: string) => {
        setCollapsedStations(prev => ({
            ...prev,
            [wpId]: !prev[wpId]
        }))
    }

    const sortedWaypoints = [...waypoints].sort(compareCourseOrder)
    const bagWaypoints = sortedWaypoints
        .filter(wp => isVisibleBag(wp, getRaceSupport(race).crew, canWriteDropBags))
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

    const getWaypointItems = (wp: Waypoint) => {
        const kind = getBagKind(wp) ?? 'official'
        const template = getDropBagTemplateForKind(kind, dropBagTemplate)
        return getDropBagEditorItems(wp.drop_bag_items, template, {
            isNight: lightingByWaypoint.get(wp.id)?.needsLight ?? false,
            isHot,
            isCold,
        })
    }

    const getNextAidStation = (wp: Waypoint) =>
        aidStationWaypoints.find(candidate => isAfterWaypoint(candidate, wp)) ?? null

    const getNextBagWaypoint = (wp: Waypoint) =>
        bagWaypoints.find(candidate => isAfterWaypoint(candidate, wp)) ?? null

    const lightingByWaypoint = new Map(bagWaypoints.map(wp => {
        // Coverage ends at the next available bag, not an intervening aid-only station.
        const next = getNextBagWaypoint(wp) ?? sortedWaypoints.find(candidate => candidate.type === 'finish' && isAfterWaypoint(candidate, wp))
        const lighting = next && getBagKind(wp) !== 'finish' ? getBagLighting({
            startDatetime: race.start_datetime,
            arrivalMinutes: getWaypointArrival(wp)?.arrivalTime,
            nextArrivalMinutes: getWaypointArrival(next)?.arrivalTime,
            from: wp,
            to: next,
        }) : null
        return [wp.id, lighting ? { ...lighting, message: getBagLightingMessage(lighting, next!.name) } : null]
    }))

    const getBagResourceLabel = (target: Waypoint | null) =>
        target && getBagKind(target) === 'crew'
            ? 'Next crew'
            : 'Next drop bag'

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
        const nextAid = getNextAidStation(wp)
        const nextBag = getNextBagWaypoint(wp)
        const nextBagKind = nextBag ? getBagKind(nextBag) : null
        if (nextAid && nextBag && nextAid.id === nextBag.id) {
            return [buildCoverageRow(wp, nextBagKind === 'crew' ? 'Next Aid and Crew Bag' : 'Next Aid and Drop Bag', nextAid, 'text-blue-400')]
        }
        return [
            buildCoverageRow(wp, 'Next aid', nextAid, 'text-blue-400'),
            buildCoverageRow(wp, getBagResourceLabel(nextBag), nextBag, nextBagKind === 'crew' ? 'text-emerald-400' : 'text-orange-400'),
        ]
    }

    const handlePrintList = async () => {
        setPrintOpen(true)
        setPrintBusy(true)
        setPrintError(null)
        setPrintPdf(null)
        const printableBags: PrintableDropBag[] = bagWaypoints.map(wp => ({
            stationName: wp.name,
            bagName: wp.drop_bag_name,
            mile: wp.mile,
            arrival: getWaypointArrival(wp)?.timeOfDay ?? null,
            cutoff: formatBagCutoff(wp.cutoff_time, race.timezone, clock24h),
            items: getWaypointItems(wp).filter(item => item.checked).map(item => ({ text: item.text, quantity: item.quantity })),
            notes: getDropBagNotes(wp),
            tellRunner: wp.crew_relay_notes,
            nextLegReminder: wp.runner_next_leg_notes,
            lighting: lightingByWaypoint.get(wp.id)?.message ?? null,
            coverageRows: getCoverageRows(wp),
        }))
        try {
            const { createDropBagListPdf } = await import('./drop-bag-pdf')
            const blob = await createDropBagListPdf(
                race.name,
                plans.hasCalculated && planAMinutes > 0 ? formatPlanALabel(planAMinutes) : null,
                printableBags,
            )
            const filename = `${race.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'race'}-drop-bags.pdf`
            setPrintPdf({ url: URL.createObjectURL(blob), filename })
        } catch (error) {
            console.error('Failed to prepare drop bag list:', error)
            setPrintError('Could not prepare the PDF. Please try again.')
        } finally {
            setPrintBusy(false)
        }
    }

    if (bagWaypoints.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl my-6">
                <Backpack className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-xl font-medium text-white mb-2">No bag points configured</h3>
                <p>Go to the map tab and edit aid stations to enable drop bags.</p>
            </div>
        )
    }

    return (
        <div className="race-tab-page p-4 md:p-8 animate-in fade-in duration-500 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 items-start relative">

            <div className="flex-1 space-y-6 min-w-0 w-full print:hidden">

                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Backpack className="w-6 h-6 text-orange-500 print:hidden" />
                            <span className="print:hidden">Drop Bag Planner</span>
                            <span className="hidden print:inline-block">Drop Bags - {race.name}</span>
                        </h2>
                        {plans.hasCalculated && planAMinutes > 0 && (
                            <p className="mt-1 text-sm text-neutral-400 print:text-neutral-700">
                                Arrival times use {formatPlanALabel(planAMinutes)}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <DropBagTemplateEditor race={race} canEdit={canEditRaceSettings} waypoints={waypoints} bagWaypointIds={waypoints.filter(waypoint => getBagKind(waypoint) !== null).map(waypoint => waypoint.id)} />
                        <button
                            onClick={handlePrintList}
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
                        const isFinishBag = kind === 'finish'
                        const isCrewBag = kind === 'crew'
                        const displayName = isStartBag ? 'Start' : isFinishBag ? 'Finish' : wp.name
                        const arrival = getWaypointArrival(wp)
                        const arrivalIsNight = !!arrival && !!race.start_datetime && isNight(arrival.arrivalTime, wp.lat, wp.lon)
                        const hasBagPlan = hasSavedBagPlan(wp)
                        const cardClass = isCrewBag
                            ? 'bg-emerald-950/10 border-emerald-900/60 hover:border-emerald-500/50'
                            : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                        const labelClass = isCrewBag
                            ? 'border-emerald-700/60 bg-emerald-950/70 text-emerald-200'
                            : 'border-orange-900/60 bg-orange-950/40 text-orange-200'
                        return (
                            <div
                                key={wp.id}
                                className={`border rounded-lg p-4 cursor-pointer transition-colors group flex flex-col ${cardClass}`}
                                onClick={() => setSelectedWaypoint(wp)}
                            >
                                <div className="min-w-0 space-y-2">
                                    {isCrewBag && <div className="flex flex-wrap items-center gap-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-[0.16em] border rounded-full px-2 py-0.5 ${labelClass}`}>
                                            {getBagKindLabel(kind)}
                                        </span>
                                        {isCrewBag && !hasBagPlan && (
                                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                                                Available
                                            </span>
                                        )}
                                    </div>}

                                    <div className="min-w-0">
                                        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-bold text-white group-hover:text-orange-400 transition-colors">
                                            <span>{displayName}</span>
                                            {wp.drop_bag_name && (
                                                <span className="max-w-full truncate rounded border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-sm font-semibold text-neutral-200">
                                                    {wp.drop_bag_name}
                                                </span>
                                            )}
                                        </h3>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
                                            <span className="font-mono text-neutral-300">Mile {wp.mile.toFixed(1)}</span>
                                            {arrival ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span className="text-neutral-500">{getBagKind(wp) === 'start' ? 'Start time' : 'Arrival'}</span>
                                                    <span className="font-mono text-neutral-300">{arrival.timeOfDay}</span>
                                                    {arrivalIsNight
                                                        ? <Moon className="w-3.5 h-3.5 text-blue-300" />
                                                        : <Sun className="w-3.5 h-3.5 text-yellow-500" />}
                                                </span>
                                            ) : plans.hasCalculated ? (
                                                <span className="text-neutral-600">ETA unavailable</span>
                                            ) : null}
                                            {isCrewBag && <span className="text-emerald-400">Crew access</span>}
                                        </div>
                                    </div>

                                    {wp.cutoff_time && <p className="text-sm text-red-400">Cutoff <span className="font-mono font-semibold">{formatBagCutoff(wp.cutoff_time, race.timezone, clock24h)}</span></p>}
                                    <div className="border-t border-neutral-800 pt-3">
                                        <DropBagCoverage rows={getCoverageRows(wp)} />
                                    </div>

                                    {!plans.hasCalculated && (
                                        <div className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                                            <p className="text-sm text-neutral-500">Set a goal time to show ETA.</p>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onGoToPacePlan() }}
                                                className="text-sm text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 transition-colors"
                                            >
                                                <Target className="w-4 h-4" />
                                                Pace Plan
                                            </button>
                                        </div>
                                    )}


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
                        coverageRows={getCoverageRows(selectedWaypoint)}
                        cutoff={formatBagCutoff(selectedWaypoint.cutoff_time, race.timezone, clock24h)}
                        needsLight={lightingByWaypoint.get(selectedWaypoint.id)?.needsLight ?? false}
                        lightingMessage={lightingByWaypoint.get(selectedWaypoint.id)?.message ?? undefined}
                        isNight={
                            planA?.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)
                                ? isNight(planA.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)!.arrivalTime, selectedWaypoint.lat, selectedWaypoint.lon)
                                : false
                        }
                        onClose={() => setSelectedWaypoint(null)}
                    />
                )}
            </div>

            {printOpen && createPortal(
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Printable drop bag list">
                    <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-white shadow-2xl">
                        <h2 className="text-xl font-bold">Print Drop Bag List</h2>
                        {printBusy ? <p className="mt-3 text-neutral-300">Preparing a PDF with one bag per page…</p> : printError ? <p className="mt-3 text-red-300" role="alert">{printError}</p> : <p className="mt-3 text-neutral-300">Your printable PDF is ready. Open it to print, or save a copy.</p>}
                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button type="button" onClick={() => setPrintOpen(false)} className="rounded-lg bg-neutral-800 px-4 py-2 font-medium hover:bg-neutral-700">Close</button>
                            {printPdf && <>
                                <a href={printPdf.url} target="_blank" rel="noreferrer" className="rounded-lg bg-neutral-700 px-4 py-2 font-medium hover:bg-neutral-600">Open PDF</a>
                                <a href={printPdf.url} download={printPdf.filename} className="rounded-lg bg-orange-600 px-4 py-2 font-semibold hover:bg-orange-500">Download PDF</a>
                            </>}
                            {printError && <button type="button" onClick={handlePrintList} className="rounded-lg bg-orange-600 px-4 py-2 font-semibold hover:bg-orange-500">Try again</button>}
                        </div>
                    </div>
                </div>, document.body,
            )}

            {/* Side Panel */}
            <div className={`drop-bags-print-sheet w-full shrink-0 print:w-full print:block ${isSidePanelOpen ? 'lg:w-80' : 'lg:w-auto'}`}>
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

                    <h3 className="hidden print:block text-xl font-bold text-neutral-800 mb-4 border-b border-neutral-300 pb-2">
                        Drop Bag Contents{plans.hasCalculated && planAMinutes > 0 ? ` · ${formatPlanALabel(planAMinutes)}` : ''}
                    </h3>

                    <div className="drop-bags-print-list block p-4 space-y-6 max-h-[calc(100vh-150px)] overflow-y-auto print:max-h-none print:overflow-visible">
                        {bagWaypoints.map(wp => {
                            const kind = getBagKind(wp) ?? 'official'
                            const isStartBag = kind === 'start'
                            const isFinishBag = kind === 'finish'
                            const isCrewBag = kind === 'crew'
                            const displayName = isStartBag ? 'Start' : isFinishBag ? 'Finish' : wp.name
                            const items = getWaypointItems(wp)
                            const packedItems = items.filter(i => i.checked)

                            const isCollapsed = collapsedStations[wp.id]

                            return (
                                <div key={wp.id} className={`drop-bag-print-section print:break-inside-avoid ${!canWriteDropBags && packedItems.length === 0 ? 'hidden print:block' : ''}`}>
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <button
                                            type="button"
                                            className={`min-w-0 flex items-center gap-1 text-left text-sm font-bold text-neutral-300 print:text-neutral-800 hover:text-white transition-colors ${isCrewBag ? 'text-emerald-400' : 'text-orange-400'}`}
                                            onClick={() => toggleStation(wp.id)}
                                        >
                                            {isCollapsed ? <ChevronDown className="w-4 h-4 print:hidden" /> : <ChevronUp className="w-4 h-4 print:hidden" />}
                                            <span className="min-w-0 truncate text-neutral-300">
                                                {displayName}
                                                {wp.drop_bag_name ? ` (${wp.drop_bag_name})` : ''}
                                                {isCrewBag ? ' · Crew bag' : ''}
                                            </span>
                                        </button>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-neutral-500 print:text-neutral-600 text-xs">
                                                <span className="font-mono text-neutral-300">Mile {wp.mile.toFixed(1)}</span>
                                                {getWaypointArrival(wp) && <span className="ml-2">{getBagKind(wp) === 'start' ? 'Start time' : 'Arrival'} <span className="font-mono">{getWaypointArrival(wp)!.timeOfDay}</span></span>}
                                            </span>
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
                                    <div className={`space-y-2 ${isCollapsed ? 'hidden' : ''} print:block`}>
                                            {packedItems.length > 0 ? (
                                                <ul className="drop-bag-print-items space-y-1 pl-5">
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
                                                <div className="pl-5 text-sm italic text-neutral-600 print:text-neutral-700">
                                                    No items packed yet.
                                                </div>
                                            )}
                                    </div>
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
