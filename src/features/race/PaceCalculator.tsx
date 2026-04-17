'use client'

import { useState } from 'react'
import { Course, Race, TerrainNode, Waypoint } from '@/types/database'
import { calculatePacePlan, PacingStrategy } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { Calculator, Clock, TrendingUp, Activity, Users, Footprints, Moon, Sun, ArrowRight, Printer } from 'lucide-react'

interface PaceCalculatorProps {
    race: Race
    course: Course
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h?: boolean
    unitsDistance?: 'miles' | 'kilometers'
}

export function PaceCalculator({ race, course, waypoints, terrainNodes, clock24h = false, unitsDistance = 'miles' }: PaceCalculatorProps) {
    const [strategyMode, setStrategyMode] = useState<'planA' | 'planB' | 'planC'>('planA')
    const [plan, setPlan] = useState<ReturnType<typeof calculatePacePlan> | null>(null)

    const { plans, setPlanA, setPlanB, setPlanCBuffer, markCalculated } = usePacePlans(race.id)
    const { planATimeStr, planBTimeStr, planCBufferStr } = plans

    const { a: planAMinutes, b: planBMinutes, c: planCMinutes } = computePlanMinutes(plans, race.overall_cutoff)

    const getStrategyValue = (): number => {
        if (strategyMode === 'planA') return planAMinutes
        if (strategyMode === 'planC') return planCMinutes ?? 0
        return planBMinutes
    }

    const handleCalculate = () => {
        if (!course.elevation_samples) return

        const strategy: PacingStrategy = {
            mode: 'time',
            value: getStrategyValue()
        }

        const profile = course.elevation_samples as { distance: number; elevation: number }[]

        const result = calculatePacePlan(
            profile,
            course.total_distance_miles || 0,
            waypoints,
            terrainNodes,
            strategy,
            race,
            clock24h
        )

        setPlan(result)
        markCalculated()
    }

    const isKm = unitsDistance === 'kilometers'
    const dist = course.total_distance_miles || 0
    const displayDist = isKm ? dist * 1.60934 : dist
    const targetMin = getStrategyValue()

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

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto print:block print:p-0">
            {/* Left Col: Configuration */}
            <div className="lg:col-span-1 space-y-6 print:hidden">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-blue-500" /> Goal Setting
                    </h2>

                    {/* Mode Selector */}
                    <div className="grid grid-cols-3 gap-2 mb-6 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'planA' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('planA')}
                        >
                            Plan A (Goal)
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'planB' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('planB')}
                        >
                            Plan B (Mid)
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'planC' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('planC')}
                        >
                            Plan C (Cutoff)
                        </button>
                    </div>

                    {/* Main Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-neutral-400 mb-2">
                            {strategyMode === 'planA' ? 'Target Finish Time (HH:MM)' :
                                strategyMode === 'planC' ? 'Safety Buffer (HH:MM ahead of cutoff)' :
                                    'Target Finish Time (Calculated Midpoint)'}
                        </label>
                        {strategyMode === 'planC' && !race.overall_cutoff && (
                            <div className="text-red-400 text-xs mb-2">Race has no overall cutoff time set.</div>
                        )}
                        <input
                            type="text"
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white text-lg font-mono placeholder-neutral-600 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={strategyMode === 'planA' ? "24:00" : strategyMode === 'planC' ? "00:30" : `${Math.floor(planBMinutes / 60)}:${(Math.floor(planBMinutes % 60)).toString().padStart(2, '0')}`}
                            value={strategyMode === 'planA' ? planATimeStr : strategyMode === 'planC' ? planCBufferStr : (planBTimeStr || `${Math.floor(planBMinutes / 60)}:${(Math.floor(planBMinutes % 60)).toString().padStart(2, '0')}`)}
                            onChange={(e) => {
                                if (strategyMode === 'planA') { setPlanA(e.target.value) }
                                else if (strategyMode === 'planC') { setPlanCBuffer(e.target.value) }
                                else if (strategyMode === 'planB') setPlanB(e.target.value);
                            }}
                        />

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
                        onClick={handleCalculate}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/20"
                    >
                        Generate Plan
                    </button>
                </div>
            </div>

            {/* Right Col: Results */}
            <div className="lg:col-span-2 space-y-6 print:block">
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
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden mt-6 print:border-none print:shadow-none print:bg-white text-black print:text-black">
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
                            <div className="overflow-x-auto print:overflow-visible">
                                <table className="w-full text-sm text-left print:text-xs">
                                    <thead className="bg-neutral-950 text-neutral-400 print:bg-neutral-100 print:text-black uppercase text-xs font-semibold">
                                        <tr>
                                            <th className="px-6 py-3">Location</th>
                                            <th className="px-6 py-3">{isKm ? 'Km' : 'Mile'}</th>
                                            <th className="px-6 py-3">Seg {isKm ? 'Km' : 'Mile'}</th>
                                            <th className="px-6 py-3 text-right">Segment Time</th>
                                            <th className="px-6 py-3 text-right">Clock Time</th>
                                            <th className="px-6 py-3 text-right">Elapsed Time</th>
                                            <th className="px-6 py-3 text-right">Segment Pace</th>
                                            <th className="px-6 py-3 text-right">Overall Pace</th>
                                            <th className="px-6 py-3 text-right">Cutoff Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {plan.waypointArrivals.map((arrival) => {
                                            const wp = waypoints.find(w => w.id === arrival.waypointId)
                                            if (!wp) return null

                                            return (
                                                <tr key={arrival.waypointId} className="hover:bg-neutral-800/50 transition-colors print:border-b print:border-neutral-200">
                                                    <td className="px-6 py-4 print:py-2">
                                                        <div className="font-medium text-white print:text-black flex items-center gap-2">
                                                            <span>
                                                                {wp.name}
                                                                {race.start_datetime && (
                                                                    isNight(arrival.arrivalTime)
                                                                        ? <span title="Nighttime Arrival" className="inline-flex items-center"><Moon className="w-3.5 h-3.5 text-blue-300 print:text-neutral-500 ml-1.5 print:hidden" /><span className="hidden print:inline text-neutral-500 ml-1 border px-1 rounded text-[10px]">NIGHT</span></span>
                                                                        : <span title="Daytime Arrival" className="inline-flex items-center print:hidden"><Sun className="w-3.5 h-3.5 text-yellow-500 ml-1.5" /></span>
                                                                )}
                                                            </span>
                                                            <div className="flex gap-1 ml-1 print:hidden">
                                                                {wp.crew_allowed && <span title="Crew Allowed"><Users className="w-4 h-4 text-green-400" /></span>}
                                                                {wp.pacer_allowed && <span title="Pacer Allowed"><Footprints className="w-4 h-4 text-blue-400" /></span>}
                                                                {wp.has_drop_bag && <span title="Drop Bag" className="text-[12px] opacity-90 leading-none flex items-center justify-center pt-0.5">🎒</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 font-mono text-neutral-300 print:text-neutral-800">
                                                        {(isKm ? wp.mile * 1.60934 : wp.mile).toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 font-mono text-neutral-400 print:text-neutral-600">
                                                        {(isKm ? arrival.segmentMile * 1.60934 : arrival.segmentMile).toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 text-right font-mono text-neutral-400 print:text-neutral-600">
                                                        {arrival.segmentTime}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 text-right font-mono text-neutral-400 print:text-black font-semibold">
                                                        {arrival.timeOfDay}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 text-right font-mono text-neutral-400 print:text-neutral-600">
                                                        {Math.floor(arrival.arrivalTime / 60)}:{Math.floor(arrival.arrivalTime % 60).toString().padStart(2, '0')}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 text-right font-mono text-neutral-400 print:text-neutral-600">
                                                        {formatPace(arrival.segmentPace)}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 text-right font-mono text-neutral-400 print:text-neutral-600">
                                                        {formatPace(arrival.overallPace)}
                                                    </td>
                                                    <td className="px-6 py-4 print:py-2 text-right font-mono text-red-400 print:text-red-700 font-semibold max-w-[120px] truncate" title={arrival.cutoffTime}>
                                                        {arrival.cutoffTime || '--'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl p-12">
                        <Calculator className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">Configure your goals to generate a plan</p>
                    </div>
                )}
            </div>
        </div >
    )
}
