import { useState, useEffect } from 'react'
import { Race, Course, Waypoint, TerrainNode } from '@/types/database'
import { calculatePacePlan } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { Backpack, Clock, Sun, Moon, Info, Printer, List, ChevronDown, ChevronUp, Target } from 'lucide-react'
import { DropBagModal } from './DropBagModal'
import { DropBagNotes } from './DropBagNotes'
import { DropBagTemplateEditor } from './DropBagTemplateEditor'
import { usePermission } from '@/features/auth/usePermission'
import SunCalc from 'suncalc'

interface DropBagsSectionProps {
    race: Race
    course: Course | null
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h?: boolean
    onGoToPacePlan: () => void
}

export function DropBagsSection({ race, course, waypoints, terrainNodes, clock24h = false, onGoToPacePlan }: DropBagsSectionProps) {
    const { canEdit, canEditRaceSettings } = usePermission(race.id, race.race_director_user_id)
    const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null)
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true)
    const [collapsedStations, setCollapsedStations] = useState<Record<string, boolean>>({})

    const toggleStation = (wpId: string) => {
        setCollapsedStations(prev => ({
            ...prev,
            [wpId]: !prev[wpId]
        }))
    }

    const isStartBag = (wp: Waypoint) => wp.type === 'start' || wp.mile <= 0.01
    const isDropBag = (wp: Waypoint) => !!wp.has_drop_bag || wp.type === 'drop_bag'
    const dropBagWaypoints = waypoints
        .filter(wp => isDropBag(wp) || isStartBag(wp))
        .sort((a, b) => a.mile - b.mile)

    const { plans } = usePacePlans(race.id)
    const { a: planAMinutes, b: planBMinutes, c: planCMinutes } = computePlanMinutes(plans, race.overall_cutoff)

    // Defer the three pace-plan simulations off the click path: each one runs a
    // bisection up to ~16 simulateRun iterations over thousands of samples, which
    // was making the tab feel unresponsive. useEffect + setTimeout(0) yields to
    // the browser so the new tab paints before the compute starts.
    type Plan = ReturnType<typeof calculatePacePlan> | null
    const [computed, setComputed] = useState<{ A: Plan; B: Plan; C: Plan } | null>(null)

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
                    ? calculatePacePlan(samples, totalDist, waypoints, terrainNodes, { mode: 'time', value: minutes }, race, clock24h, [], plans.runnerProfile)
                    : null
            setComputed({
                A: build(planAMinutes),
                B: build(planBMinutes),
                C: planCMinutes !== null ? build(planCMinutes) : null,
            })
        }, 0)
        return () => clearTimeout(handle)
    }, [plans.hasCalculated, plans.runnerProfile, planAMinutes, planBMinutes, planCMinutes, course, waypoints, terrainNodes, race, clock24h])

    const planA = computed?.A ?? null
    const planB = computed?.B ?? null
    const planC = computed?.C ?? null

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

    if (dropBagWaypoints.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl my-6">
                <Backpack className="w-12 h-12 mb-4 opacity-20" />
                <h3 className="text-xl font-medium text-white mb-2">No Start or Drop Bag points configured</h3>
                <p>Go to the map tab and edit aid stations to enable drop bags for specific locations.</p>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 animate-in fade-in duration-500 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 items-start relative">

            <div className="flex-1 space-y-6 min-w-0 w-full print:hidden">

                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Backpack className="w-6 h-6 text-orange-500 print:hidden" />
                        <span className="print:hidden">Start & Drop Bag Planner</span>
                        <span className="hidden print:inline-block">Start & Drop Bags - {race.name}</span>
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
                            <strong className="text-white block mb-1">Weather Context for Drop Bags</strong>
                            {isHot && <div className="text-orange-400">• High temps projected ({race.avg_temp_high}°): Plan for ice bandanas and extra fluids/electrolytes.</div>}
                            {isCold && <div className="text-blue-300">• Low temps projected ({race.avg_temp_low}°): Consider packing layers, gloves, and dry socks.</div>}
                            {race.weather_notes && <div className="text-neutral-400 mt-1 italic">{race.weather_notes}</div>}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {dropBagWaypoints.map(wp => {
                        return (
                            <div
                                key={wp.id}
                                className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 group flex flex-col"
                                onClick={() => setSelectedWaypoint(wp)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-orange-400 transition-colors">
                                            {isStartBag(wp) ? 'Start' : wp.name}
                                        </h3>
                                        <div className="text-neutral-500 text-sm font-mono">Mile {wp.mile.toFixed(1)}</div>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-neutral-950 flex items-center justify-center border border-neutral-800 group-hover:border-orange-500/50 transition-colors">
                                        {isStartBag(wp)
                                            ? <span className="text-[10px] font-bold text-emerald-300 leading-none">Start</span>
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
                                                { label: 'A', plan: planA, color: 'text-emerald-400' },
                                                { label: 'B', plan: planB, color: 'text-blue-400' },
                                                ...(planCMinutes !== null ? [{ label: 'C', plan: planC, color: 'text-orange-400' }] : []),
                                            ].map(({ label, plan: p, color }) => {
                                                const arrival = p?.waypointArrivals.find(a => a.waypointId === wp.id)
                                                return (
                                                    <div key={label} className="flex items-center gap-2 text-sm bg-neutral-950/50 px-2 py-1.5 rounded border border-neutral-800">
                                                        <span className={`text-xs font-bold w-4 shrink-0 ${color}`}>{label}</span>
                                                        <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                                        <span className="text-neutral-300">{arrival?.timeOfDay ?? '—'}</span>
                                                        {arrival && race.start_datetime && (
                                                            isNight(arrival.arrivalTime, wp.lat, wp.lon)
                                                                ? <Moon className="w-3.5 h-3.5 text-blue-300 ml-auto" />
                                                                : <Sun className="w-3.5 h-3.5 text-yellow-500 ml-auto" />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {wp.drop_bag_name && (
                                        <div className="mt-2 p-2 bg-neutral-950/50 rounded border border-neutral-800">
                                            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">
                                                {isStartBag(wp) ? 'Start Gear' : 'Bag Name'}
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
                        canEdit={canEdit}
                        arrivalTime={planA?.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)}
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
                            {isSidePanelOpen ? <span>All Drop Bags</span> : <span className="hidden lg:hidden">All Drop Bags</span>}
                        </div>
                        {isSidePanelOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>

                    <h3 className="hidden print:block text-xl font-bold text-neutral-800 mb-4 border-b border-neutral-300 pb-2">Start & Drop Bag Contents</h3>

                    <div className={`${isSidePanelOpen ? 'block' : 'hidden'} print:block p-4 space-y-6 max-h-[calc(100vh-150px)] overflow-y-auto print:max-h-none print:overflow-visible`}>
                        {dropBagWaypoints.map(wp => {
                            const items = wp.drop_bag_items as { checked: boolean, text: string, quantity?: string }[] || []
                            const packedItems = items.filter(i => i.checked)
                            if (packedItems.length === 0) return null

                            const isCollapsed = collapsedStations[wp.id]

                            return (
                                <div key={wp.id} className="print:break-inside-avoid">
                                    <h4
                                        className="text-sm font-bold text-neutral-300 print:text-neutral-800 mb-2 flex justify-between items-center cursor-pointer hover:text-white transition-colors"
                                        onClick={() => toggleStation(wp.id)}
                                    >
                                        <div className="flex items-center gap-1 text-orange-400">
                                            {isCollapsed ? <ChevronDown className="w-4 h-4 print:hidden" /> : <ChevronUp className="w-4 h-4 print:hidden" />}
                                            <span className="text-neutral-300">
                                                {isStartBag(wp) ? 'Start' : wp.name}
                                                {wp.drop_bag_name ? ` (${wp.drop_bag_name})` : ''}
                                            </span>
                                        </div>
                                        <span className="text-neutral-500 print:text-neutral-600 font-mono text-xs">Mile {wp.mile.toFixed(1)}</span>
                                    </h4>
                                    {!isCollapsed && (
                                        <ul className="space-y-1 pl-5">
                                            {packedItems.map((item, idx) => (
                                                <li key={idx} className="text-sm text-neutral-400 print:text-neutral-700 flex items-start gap-2">
                                                    <span className="text-orange-500/50 print:text-neutral-400 mt-1">&bull;</span>
                                                    <span className="leading-snug">
                                                        {item.quantity && <span className="text-neutral-300 print:text-neutral-900 font-medium mr-1">{item.quantity}x</span>}
                                                        {item.text}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )
                        })}
                        {dropBagWaypoints.every(wp => {
                            const items = wp.drop_bag_items as { checked: boolean }[] || [];
                            return items.filter(i => i.checked).length === 0;
                        }) && (
                                <div className="text-sm text-neutral-500 italic text-center py-4 print:hidden">
                                    No items packed yet. Click an aid station to add items.
                                </div>
                            )}
                    </div>
                </div>
            </div>

        </div>
    )
}
