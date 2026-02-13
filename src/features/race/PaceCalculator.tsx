'use client'

import { useState } from 'react'
import { Course, Race, TerrainNode, Waypoint } from '@/types/database'
import { calculatePacePlan, PacingStrategy } from './pace-utils'
import { Calculator, Clock, TrendingUp, Activity, Users, Footprints, Package } from 'lucide-react'

interface PaceCalculatorProps {
    race: Race
    course: Course
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h?: boolean
}

export function PaceCalculator({ race, course, waypoints, terrainNodes, clock24h = false }: PaceCalculatorProps) {
    const [strategyMode, setStrategyMode] = useState<PacingStrategy['mode'] | 'cutoff'>('time')
    // Inputs (stored as strings for easier editing)
    const [targetTimeStr, setTargetTimeStr] = useState('24:00') // HH:MM
    const [targetPaceStr, setTargetPaceStr] = useState('12:00') // MM:SS
    const [targetGapStr, setTargetGapStr] = useState('11:00') // MM:SS
    const [cutoffBufferStr, setCutoffBufferStr] = useState('00:30') // HH:MM

    // Delays are now handled per-waypoint in properties

    const [plan, setPlan] = useState<ReturnType<typeof calculatePacePlan> | null>(null)

    // Helper to parse inputs
    const getStrategyValue = (): number => {
        if (strategyMode === 'time') {
            const [h, m] = targetTimeStr.split(':').map(Number)
            return (h || 0) * 60 + (m || 0)
        } else if (strategyMode === 'cutoff') {
            // Parse race cutoff
            if (!race.overall_cutoff) return 0
            // Assuming parsed "HH:MM" or "HHh" or similar. 
            // Simple parser: currently assuming stored as HH:MM based on other fields? 
            // If it's free text, this is risky. Let's try to parse "HH:MM".
            let cutoffMin = 0
            if (race.overall_cutoff.includes(':')) {
                const [h, m] = race.overall_cutoff.split(':').map(Number)
                cutoffMin = (h || 0) * 60 + (m || 0)
            } else {
                // Try numeric
                const val = parseFloat(race.overall_cutoff)
                if (!isNaN(val)) cutoffMin = val * 60 // Assume hours if number
            }

            const [bh, bm] = cutoffBufferStr.split(':').map(Number)
            const bufferMin = (bh || 0) * 60 + (bm || 0)

            return Math.max(0, cutoffMin - bufferMin)
        } else {
            const [m, s] = (strategyMode === 'pace' ? targetPaceStr : targetGapStr).split(':').map(Number)
            return (m || 0) + (s || 0) / 60
        }
    }

    const handleCalculate = () => {
        if (!course.elevation_samples) return

        let mode: PacingStrategy['mode'] = 'time'
        if (strategyMode === 'pace') mode = 'pace'
        if (strategyMode === 'gap') mode = 'gap'
        // If cutoff, we treat it as 'time' with calculated value

        const strategy: PacingStrategy = {
            mode: mode,
            value: getStrategyValue()
        }

        const profile = course.elevation_samples as { distance: number; elevation: number }[]
        const startTime = race.start_datetime ? new Date(race.start_datetime) : undefined

        const result = calculatePacePlan(
            profile,
            course.total_distance_miles || 0,
            waypoints,
            terrainNodes,
            strategy,
            startTime,
            race.timezone || undefined,
            clock24h
        )

        setPlan(result)
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 max-w-7xl mx-auto">
            {/* Left Col: Configuration */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-blue-500" /> Goal Setting
                    </h2>

                    {/* Mode Selector */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'time' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('time')}
                        >
                            Total Time
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'cutoff' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('cutoff')}
                        >
                            Cutoff
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'pace' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('pace')}
                        >
                            Avg Pace
                        </button>
                        <button
                            className={`py-2 text-xs font-medium rounded ${strategyMode === 'gap' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                            onClick={() => setStrategyMode('gap')}
                        >
                            Norm. Pace
                        </button>
                    </div>

                    {/* Main Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-neutral-400 mb-2">
                            {strategyMode === 'time' ? 'Target Finish Time (HH:MM)' :
                                strategyMode === 'cutoff' ? 'Safety Buffer (HH:MM ahead of cutoff)' :
                                    strategyMode === 'pace' ? 'Average Overall Pace (MM:SS/mi)' :
                                        'Normalized Pace (GAP) (MM:SS/mi)'}
                        </label>
                        {strategyMode === 'cutoff' && !race.overall_cutoff && (
                            <div className="text-red-400 text-xs mb-2">Race has no overall cutoff time set.</div>
                        )}
                        <input
                            type="text"
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white text-lg font-mono placeholder-neutral-600 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder={strategyMode === 'time' ? "24:00" : strategyMode === 'cutoff' ? "00:30" : "12:00"}
                            value={strategyMode === 'time' ? targetTimeStr : (strategyMode === 'cutoff' ? cutoffBufferStr : (strategyMode === 'pace' ? targetPaceStr : targetGapStr))}
                            onChange={(e) => {
                                if (strategyMode === 'time') setTargetTimeStr(e.target.value)
                                else if (strategyMode === 'cutoff') setCutoffBufferStr(e.target.value)
                                else if (strategyMode === 'pace') setTargetPaceStr(e.target.value)
                                else setTargetGapStr(e.target.value)
                            }}
                        />
                        {strategyMode === 'cutoff' && race.overall_cutoff && (
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
            <div className="lg:col-span-2 space-y-6">
                {plan ? (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                                    {Math.floor(plan.avgPace)}:{(Math.round((plan.avgPace % 1) * 60)).toString().padStart(2, '0')}
                                </div>
                                <div className="text-xs text-neutral-500">/mi (Moving)</div>
                            </div>
                            <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-800">
                                <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Norm. Pace
                                </div>
                                <div className="text-2xl font-black text-blue-400 font-mono">
                                    {Math.floor(plan.avgGap)}:{(Math.round((plan.avgGap % 1) * 60)).toString().padStart(2, '0')}
                                </div>
                                <div className="text-xs text-neutral-500">/mi (GAP)</div>
                            </div>
                            {/* Extra slot */}
                        </div>

                        {/* Splits Table */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-neutral-800">
                                <h3 className="font-bold text-white">Splits</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-neutral-950 text-neutral-400 uppercase text-xs font-semibold">
                                        <tr>
                                            <th className="px-6 py-3">Location</th>
                                            <th className="px-6 py-3">Mile</th>
                                            <th className="px-6 py-3">Seg Mile</th>
                                            <th className="px-6 py-3 text-right">Segment Time</th>
                                            <th className="px-6 py-3 text-right">Clock Time</th>
                                            <th className="px-6 py-3 text-right">Elapsed Time</th>
                                            <th className="px-6 py-3 text-right">Cutoff Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {plan.waypointArrivals.map((arrival) => {
                                            const wp = waypoints.find(w => w.id === arrival.waypointId)
                                            if (!wp) return null

                                            return (
                                                <tr key={arrival.waypointId} className="hover:bg-neutral-800/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-white flex items-center gap-2">
                                                            {wp.name}
                                                            <div className="flex gap-1">
                                                                {wp.crew_allowed && <span title="Crew Allowed"><Users className="w-4 h-4 text-green-400" /></span>}
                                                                {wp.pacer_allowed && <span title="Pacer Allowed"><Footprints className="w-4 h-4 text-blue-400" /></span>}
                                                                {wp.has_drop_bag && <span title="Drop Bag"><Package className="w-4 h-4 text-orange-400" /></span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-neutral-300">
                                                        {wp.mile.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-neutral-400">
                                                        {arrival.segmentMile.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono text-neutral-400">
                                                        {arrival.segmentTime}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono text-white font-bold">
                                                        {arrival.timeOfDay}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono text-neutral-400">
                                                        {Math.floor(arrival.arrivalTime / 60)}:{Math.floor(arrival.arrivalTime % 60).toString().padStart(2, '0')}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono text-red-400">
                                                        {arrival.cutoffTime}
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
