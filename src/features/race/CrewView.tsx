import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Navigation2, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { parseRunnerProfile } from './runner-profile'
import { useRunnerCheckins } from './useRunnerCheckins'
import { useLatestRunnerLocation } from './useRunnerLocation'
import { calculatePacePlan, ActualCheckin } from './pace-utils'
import { CrewMap } from './CrewMap'
import { DropBagNotes } from './DropBagNotes'
import { DropBagSummary } from './DropBagSummary'
import { getDistance, getCoordinateAtDistance } from '@/lib/geo-utils'
import type { Race, Course, Waypoint, TerrainNode } from '@/types/database'

type PlanKey = 'A' | 'B' | 'C'

const planColors: Record<PlanKey, {
    active: string
    inactive: string
    text: string
    dot: string
}> = {
    A: {
        active: 'bg-emerald-600 text-white shadow-emerald-950/40',
        inactive: 'bg-emerald-950/40 text-emerald-100 hover:bg-emerald-900/60 border border-emerald-800/60',
        text: 'text-emerald-300',
        dot: 'bg-emerald-400',
    },
    B: {
        active: 'bg-amber-500 text-neutral-950 shadow-amber-950/40',
        inactive: 'bg-amber-950/40 text-amber-100 hover:bg-amber-900/60 border border-amber-800/60',
        text: 'text-amber-300',
        dot: 'bg-amber-400',
    },
    C: {
        active: 'bg-red-600 text-white shadow-red-950/40',
        inactive: 'bg-red-950/40 text-red-100 hover:bg-red-900/60 border border-red-800/60',
        text: 'text-red-300',
        dot: 'bg-red-400',
    },
}

interface CrewViewProps {
    raceId: string
    embedded?: boolean   // when rendered inside RaceDetail tab (skip top header)
}

export function CrewView({ raceId, embedded = false }: CrewViewProps) {
    const { profile } = useAuth() as { profile: { clock_24h?: boolean; runner_profile?: unknown } | null }
    const clock24h = !!profile?.clock_24h
    const runnerProfile = useMemo(() => parseRunnerProfile(profile?.runner_profile), [profile?.runner_profile])
    const { canLogCheckins } = usePermission(raceId)

    const [race, setRace] = useState<Race | null>(null)
    const [course, setCourse] = useState<Course | null>(null)
    const [waypoints, setWaypoints] = useState<Waypoint[]>([])
    const [terrainNodes, setTerrainNodes] = useState<TerrainNode[]>([])
    const [loading, setLoading] = useState(true)

    const { plans } = usePacePlans(raceId)
    const { checkins, upsertCheckin } = useRunnerCheckins(raceId)
    const { location: liveRunnerLocation, isFresh: liveRunnerLocationFresh } = useLatestRunnerLocation(raceId)

    const [activePlan, setActivePlan] = useState<PlanKey>('A')
    const [crewLatLon, setCrewLatLon] = useState<[number, number] | null>(null)
    const [now, setNow] = useState<number>(() => Date.now())

    // Tick each minute so the "time you have" countdown stays current.
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(t)
    }, [])

    // Fetch race-side data.
    useEffect(() => {
        let cancelled = false
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true)
        ;(async () => {
            const { data: r } = await supabase.from('races').select('*').eq('id', raceId).single()
            if (cancelled) return
            setRace(r as Race | null)

            const { data: c } = await supabase.from('courses').select('*').eq('race_id', raceId).maybeSingle()
            if (cancelled) return
            setCourse(c as Course | null)

            if (c) {
                const { data: w } = await supabase
                    .from('waypoints')
                    .select('*')
                    .eq('course_id', (c as Course).id)
                    .order('mile', { ascending: true })
                if (cancelled) return
                setWaypoints((w as Waypoint[] | null) ?? [])

                const { data: t } = await supabase
                    .from('terrain_nodes')
                    .select('*')
                    .eq('course_id', (c as Course).id)
                    .order('mile', { ascending: true })
                if (cancelled) return
                setTerrainNodes((t as TerrainNode[] | null) ?? [])
            }
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [raceId])

    // Crew current location (one-shot — user can refresh).
    const requestLocation = () => {
        if (!('geolocation' in navigator)) {
            toast.error('Location not supported')
            return
        }
        navigator.geolocation.getCurrentPosition(
            pos => setCrewLatLon([pos.coords.longitude, pos.coords.latitude]),
            err => toast.error(`Location: ${err.message}`),
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
        )
    }
    useEffect(() => { requestLocation() }, [])

    const planMinutes = useMemo(() => {
        const m = computePlanMinutes(plans, race?.overall_cutoff)
        return { A: m.a, B: m.b, C: m.c }
    }, [plans, race?.overall_cutoff])

    // Resolved pace plan with check-in re-extrapolation.
    const pacePlan = useMemo(() => {
        if (!course || !race) return null
        const samples = course.elevation_samples as { distance: number; elevation: number }[] | null
        if (!samples || samples.length < 2) return null
        const total = course.total_distance_miles ?? 0
        if (total <= 0) return null
        const target = planMinutes[activePlan] ?? 0
        if (!target || !isFinite(target) || target <= 0) return null
        const actuals: ActualCheckin[] = checkins.map(c => ({ waypointId: c.waypoint_id, arrivedAt: new Date(c.arrived_at) }))
        try {
            return calculatePacePlan(samples, total, waypoints, terrainNodes,
                { mode: 'time', value: target }, race, clock24h, actuals, runnerProfile, runnerProfile.aidStationDefaultDelay)
        } catch (err) {
            console.error('CrewView pace plan failed', err)
            return null
        }
    }, [course, race, waypoints, terrainNodes, planMinutes, activePlan, checkins, clock24h, runnerProfile])

    const elapsedMin = useMemo(() => {
        if (!race?.start_datetime) return 0
        return (now - new Date(race.start_datetime).getTime()) / 60000
    }, [race, now])

    // Predicted runner mile from current elapsed, walked along the planned arrivals curve.
    const predictedMile = useMemo(() => {
        if (!pacePlan || elapsedMin <= 0) return 0
        const arrivals = pacePlan.waypointArrivals
        if (arrivals.length === 0) return 0
        if (elapsedMin >= arrivals[arrivals.length - 1].arrivalTime) return arrivals[arrivals.length - 1].mile
        for (let i = 0; i < arrivals.length - 1; i++) {
            const a = arrivals[i]
            const b = arrivals[i + 1]
            if (elapsedMin >= a.arrivalTime && elapsedMin <= b.arrivalTime) {
                const span = b.arrivalTime - a.arrivalTime
                const t = span <= 0 ? 0 : (elapsedMin - a.arrivalTime) / span
                return a.mile + t * (b.mile - a.mile)
            }
        }
        return 0
    }, [pacePlan, elapsedMin])

    const predictedRunnerLatLon: [number, number] | null = useMemo(() => {
        if (!course?.geometry || predictedMile <= 0) return null
        const meters = predictedMile * 1609.34
        return getCoordinateAtDistance(course.geometry as any, meters) as [number, number] | null
    }, [course, predictedMile])

    const runnerLatLon: [number, number] | null = liveRunnerLocation && liveRunnerLocationFresh
        ? [liveRunnerLocation.lon, liveRunnerLocation.lat]
        : predictedRunnerLatLon

    const courseCoords: [number, number][] = useMemo(() => {
        const g = course?.geometry as any
        if (!g) return []
        if (g.type === 'LineString' && Array.isArray(g.coordinates)) return g.coordinates as [number, number][]
        if (g.type === 'Feature' && g.geometry?.type === 'LineString') return g.geometry.coordinates as [number, number][]
        return []
    }, [course])

    // "Next" = first waypoint past predicted mile (epsilon to avoid hitching on the current AS).
    const nextWaypoint: Waypoint | null = useMemo(() => {
        const sorted = [...waypoints].sort((a, b) => a.mile - b.mile)
        return sorted.find(w => w.mile > predictedMile + 0.05) ?? null
    }, [waypoints, predictedMile])

    const nextCrewWaypoint: Waypoint | null = useMemo(() => {
        const sorted = [...waypoints].sort((a, b) => a.mile - b.mile)
        return sorted.find(w => w.mile > predictedMile + 0.05 && !!w.crew_allowed) ?? null
    }, [waypoints, predictedMile])

    const arrivalAt = (wpId: string): number | null => {
        const a = pacePlan?.waypointArrivals.find(x => x.waypointId === wpId)
        return a ? a.arrivalTime : null
    }

    const minutesUntilArrival = (wpId: string): number | null => {
        const a = arrivalAt(wpId)
        if (a === null) return null
        return Math.max(0, a - elapsedMin)
    }

    const crewToWpMiles = (wp: Waypoint): number | null => {
        if (!crewLatLon) return null
        return getDistance(crewLatLon[1], crewLatLon[0], wp.lat, wp.lon)
    }

    const courseMilesToWp = (wp: Waypoint): number => Math.max(0, wp.mile - predictedMile)

    // Check-in form state.
    const [checkinWaypointId, setCheckinWaypointId] = useState<string>('')
    const [checkinTime, setCheckinTime] = useState<string>('')   // HH:MM local 24h or 12h
    const [checkinDate, setCheckinDate] = useState<string>('')   // YYYY-MM-DD
    const [showCheckin, setShowCheckin] = useState(false)
    const [dropBagWaypoint, setDropBagWaypoint] = useState<Waypoint | null>(null)

    // Next crew-accessible aid station after a given station (for leg directions).
    const nextCrewAfter = (wp: Waypoint): Waypoint | null => {
        const sorted = [...waypoints].sort((a, b) => a.mile - b.mile)
        return sorted.find(w => w.mile > wp.mile + 0.001 && !!w.crew_allowed) ?? null
    }

    const openCheckin = (wp: Waypoint) => {
        const d = new Date()
        const yyyy = d.getFullYear()
        const mm = (d.getMonth() + 1).toString().padStart(2, '0')
        const dd = d.getDate().toString().padStart(2, '0')
        const hh = d.getHours().toString().padStart(2, '0')
        const mi = d.getMinutes().toString().padStart(2, '0')
        setCheckinWaypointId(wp.id)
        setCheckinDate(`${yyyy}-${mm}-${dd}`)
        setCheckinTime(`${hh}:${mi}`)
        setShowCheckin(true)
    }

    const submitCheckin = async () => {
        if (!checkinWaypointId || !checkinDate || !checkinTime) return
        const arrived = new Date(`${checkinDate}T${checkinTime}`)
        if (isNaN(arrived.getTime())) {
            toast.error('Invalid date/time')
            return
        }
        try {
            await upsertCheckin(checkinWaypointId, arrived)
            toast.success('Arrival logged')
            setShowCheckin(false)
        } catch (err) {
            toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`)
        }
    }

    if (loading) return <div className='p-6 text-white text-center'>Loading...</div>
    if (!race) {
        return (
            <div className='p-6 text-white text-center'>
                <AlertCircle className='w-8 h-8 mx-auto mb-2 text-amber-400' />
                <div className='font-semibold'>This race isn't available.</div>
                <div className='text-sm text-neutral-400 mt-1'>It may be private. Ask the owner for access.</div>
            </div>
        )
    }

    const lastCheckin = checkins.length > 0 ? checkins[checkins.length - 1] : null
    const lastCheckinWp = lastCheckin ? waypoints.find(w => w.id === lastCheckin.waypoint_id) : null

    // Plan delta vs Plan A baseline (re-extrapolated total minus original Plan A).
    const planDeltaMin = pacePlan ? pacePlan.totalTime - planMinutes.A : 0

    return (
        <div className={embedded ? 'text-white' : 'min-h-screen bg-neutral-950 text-white'}>
            {!embedded && (
                <header className='sticky top-0 z-30 bg-neutral-900/95 backdrop-blur border-b border-neutral-800'>
                    <div className='flex items-center gap-3 px-3 py-2'>
                        <Link to={`/race/${raceId}`} className='p-2 -ml-2 rounded hover:bg-neutral-800'>
                            <ArrowLeft className='w-5 h-5' />
                        </Link>
                        <div className='min-w-0 flex-1'>
                            <div className='text-xs text-neutral-400 truncate'>Crew View</div>
                            <div className='text-sm font-semibold truncate'>{race.name}</div>
                        </div>
                    </div>
                </header>
            )}

            <main className='px-3 py-3 space-y-3 max-w-3xl mx-auto'>
                {/* Map */}
                <section className='bg-neutral-900 rounded-lg overflow-hidden'>
                    <div className='h-[50vh] min-h-[300px] sm:h-[520px]'>
                        <CrewMap
                            coordinates={courseCoords}
                            waypoints={waypoints.map(w => ({
                                id: w.id, name: w.name, lat: w.lat, lon: w.lon, mile: w.mile, crew_allowed: w.crew_allowed,
                            }))}
                            runnerLatLon={runnerLatLon}
                            crewLatLon={crewLatLon}
                            nextWaypointId={nextCrewWaypoint?.id ?? nextWaypoint?.id ?? null}
                        />
                    </div>
                    {race.start_datetime && (
                        <div className='px-3 py-2 text-xs text-neutral-400 border-t border-neutral-800 flex items-center justify-between gap-3'>
                            <span>
                                Runner {liveRunnerLocationFresh ? 'live location' : `predicted at mile ${predictedMile.toFixed(1)}`}
                            </span>
                            <span className='text-neutral-500'>
                                {liveRunnerLocationFresh && liveRunnerLocation
                                    ? new Date(liveRunnerLocation.recorded_at).toLocaleTimeString([], {
                                        hour: 'numeric', minute: '2-digit',
                                        timeZone: race.timezone || undefined, hour12: !clock24h,
                                    })
                                    : `${course?.total_distance_miles?.toFixed(1) ?? '?'} mi course`}
                            </span>
                        </div>
                    )}
                </section>

                {/* Plan toggle + status strip */}
                <section className='bg-neutral-900 rounded-lg p-3'>
                    <div className='flex items-center justify-between mb-2'>
                        <div className='text-xs text-neutral-400 uppercase tracking-wide'>Active plan</div>
                        <div className='text-xs text-neutral-400'>
                            {race.start_datetime ? `Elapsed ${formatHM(elapsedMin)}` : 'Not started'}
                        </div>
                    </div>
                    <div className='flex gap-2'>
                        {(['A', 'B', 'C'] as PlanKey[]).map(k => {
                            const m = planMinutes[k]
                            const disabled = !m || m <= 0
                            const active = activePlan === k
                            const colors = planColors[k]
                            return (
                                <button
                                    key={k}
                                    disabled={disabled}
                                    onClick={() => setActivePlan(k)}
                                    className={`flex-1 py-2 rounded text-sm font-medium transition shadow-lg ${
                                        active
                                            ? colors.active
                                            : disabled
                                                ? 'bg-neutral-800 text-neutral-600'
                                                : colors.inactive
                                    }`}
                                >
                                    <div className='text-xs opacity-80'>Plan {k}</div>
                                    <div className='text-base'>{m && m > 0 ? formatHM(m) : '—'}</div>
                                </button>
                            )
                        })}
                    </div>
                    {pacePlan && lastCheckin && (
                        <div className='mt-2 text-xs text-neutral-400'>
                            Re-extrapolated from last check-in
                            {lastCheckinWp ? ` at ${lastCheckinWp.name}` : ''}
                            {' · '}
                            <span className={planDeltaMin > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                                {planDeltaMin > 0 ? '+' : ''}{Math.round(planDeltaMin)} min vs Plan A
                            </span>
                        </div>
                    )}
                </section>

                {/* Directions to next crew AS */}
                <section className='bg-neutral-900 rounded-lg p-3'>
                    <div className='flex items-center gap-2 mb-2'>
                        <Navigation2 className='w-4 h-4 text-blue-400' />
                        <div className='text-sm font-semibold'>Next crew aid station</div>
                    </div>
                    {nextCrewWaypoint ? (
                        <div className='space-y-2'>
                            <div className='text-lg font-semibold'>{nextCrewWaypoint.name}</div>
                            <div className='grid grid-cols-2 gap-2 text-sm'>
                                <div className='bg-neutral-800 rounded p-2'>
                                    <div className='text-xs text-neutral-400'>Drive distance</div>
                                    <div className='font-semibold'>
                                        {crewToWpMiles(nextCrewWaypoint) != null
                                            ? `${(crewToWpMiles(nextCrewWaypoint) ?? 0).toFixed(1)} mi`
                                            : '—'}
                                    </div>
                                    <div className='text-[10px] text-neutral-500 mt-0.5'>straight-line</div>
                                </div>
                                <div className='bg-neutral-800 rounded p-2'>
                                    <div className='text-xs text-neutral-400'>Time you have</div>
                                    <div className='font-semibold'>
                                        {minutesUntilArrival(nextCrewWaypoint.id) != null
                                            ? formatHM(minutesUntilArrival(nextCrewWaypoint.id) ?? 0)
                                            : '—'}
                                    </div>
                                    <div className='text-[10px] text-neutral-500 mt-0.5'>til runner arrives</div>
                                </div>
                            </div>
                            <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${nextCrewWaypoint.lat},${nextCrewWaypoint.lon}&travelmode=driving`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded py-3 font-semibold'
                            >
                                <Navigation2 className='w-4 h-4' />
                                Open in Google Maps
                            </a>
                            {!crewLatLon && (
                                <button
                                    onClick={requestLocation}
                                    className='w-full text-xs text-blue-300 hover:text-blue-200 py-1'
                                >
                                    Enable location for accurate distance
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className='text-sm text-neutral-400'>No more crew-accessible aid stations ahead.</div>
                    )}
                </section>

                {/* Drop bag + crew instructions for next crew AS */}
                {nextCrewWaypoint && (
                    <section className='bg-neutral-900 rounded-lg p-3'>
                        <div className='flex items-center gap-2 mb-2'>
                            <span className='text-base leading-none' aria-hidden>🎒</span>
                            <div className='text-sm font-semibold'>Drop bag · {nextCrewWaypoint.name}</div>
                        </div>
                        <DropBagSummary waypoint={nextCrewWaypoint} />
                        <DropBagNotes waypoint={nextCrewWaypoint} className='mt-3' />
                    </section>
                )}

                {/* Distance summary: next any AS vs next crew AS */}
                <section className='bg-neutral-900 rounded-lg p-3'>
                    <div className='flex items-center gap-2 mb-2'>
                        <MapPin className='w-4 h-4 text-amber-400' />
                        <div className='text-sm font-semibold'>What runner carries</div>
                    </div>
                    <div className='grid grid-cols-2 gap-2 text-sm'>
                        <div className='bg-neutral-800 rounded p-2'>
                            <div className='text-xs text-neutral-400'>To next AS</div>
                            <div className='font-semibold'>
                                {nextWaypoint
                                    ? `${courseMilesToWp(nextWaypoint).toFixed(1)} mi`
                                    : '—'}
                            </div>
                            <div className='text-[10px] text-neutral-500 truncate'>
                                {nextWaypoint?.name ?? ''}
                                {nextWaypoint && !nextWaypoint.crew_allowed ? ' · no crew' : ''}
                            </div>
                            <div className='text-[10px] text-neutral-500 mt-0.5'>
                                {nextWaypoint && minutesUntilArrival(nextWaypoint.id) != null
                                    ? `${formatHM(minutesUntilArrival(nextWaypoint.id) ?? 0)} away`
                                    : ''}
                            </div>
                        </div>
                        <div className='bg-neutral-800 rounded p-2'>
                            <div className='text-xs text-neutral-400'>To next crew AS</div>
                            <div className='font-semibold'>
                                {nextCrewWaypoint
                                    ? `${courseMilesToWp(nextCrewWaypoint).toFixed(1)} mi`
                                    : '—'}
                            </div>
                            <div className='text-[10px] text-neutral-500 truncate'>{nextCrewWaypoint?.name ?? ''}</div>
                            <div className='text-[10px] text-neutral-500 mt-0.5'>
                                {nextCrewWaypoint && minutesUntilArrival(nextCrewWaypoint.id) != null
                                    ? `${formatHM(minutesUntilArrival(nextCrewWaypoint.id) ?? 0)} away`
                                    : ''}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Recent check-in (latest) */}
                {lastCheckin && lastCheckinWp && (
                    <section className='bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3'>
                        <div className='flex items-center gap-2'>
                            <CheckCircle2 className='w-4 h-4 text-emerald-400' />
                            <div className='text-sm font-semibold'>Last check-in</div>
                        </div>
                        <div className='mt-1 text-sm'>
                            {lastCheckinWp.name} · {new Date(lastCheckin.arrived_at).toLocaleString([], {
                                month: 'short', day: 'numeric',
                                hour: 'numeric', minute: '2-digit',
                                timeZone: race.timezone || undefined, hour12: !clock24h,
                            })}
                        </div>
                    </section>
                )}

                {/* All waypoints — predicted ETAs */}
                <section className='bg-neutral-900 rounded-lg p-3'>
                    <div className='flex items-center gap-2 mb-2'>
                        <Clock className='w-4 h-4 text-purple-400' />
                        <div className='text-sm font-semibold'>All aid stations</div>
                    </div>
                    <div className='divide-y divide-neutral-800'>
                        {waypoints.sort((a, b) => a.mile - b.mile).map(wp => {
                            const arrival = pacePlan?.waypointArrivals.find(x => x.waypointId === wp.id)
                            const past = arrival ? arrival.arrivalTime <= elapsedMin : false
                            const checked = checkins.some(c => c.waypoint_id === wp.id)
                            return (
                                <div key={wp.id} className='py-2 flex items-center gap-2'>
                                    <div className={`w-2 h-2 rounded-full ${
                                        checked ? 'bg-emerald-400' : past ? 'bg-neutral-500' : wp.crew_allowed ? planColors[activePlan].dot : 'bg-neutral-600'
                                    }`} />
                                    <div className='min-w-0 flex-1'>
                                        <div className='text-sm font-medium truncate'>
                                            {wp.name}
                                            {wp.crew_allowed && <span className='ml-1 text-[10px] text-emerald-400'>crew</span>}
                                            {checked && <span className='ml-1 text-[10px] text-emerald-400'>✓</span>}
                                        </div>
                                        <div className='text-xs text-neutral-500'>
                                            mile {wp.mile.toFixed(1)} · ETA{' '}
                                            <span className={arrival ? planColors[activePlan].text : ''}>{arrival?.timeOfDay ?? '—'}</span>
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-1 shrink-0'>
                                        {wp.crew_allowed && wp.has_drop_bag && (
                                            <button
                                                onClick={() => setDropBagWaypoint(wp)}
                                                title={`Drop bag · ${wp.name}`}
                                                aria-label={`Drop bag for ${wp.name}`}
                                                className='p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-emerald-300 text-sm leading-none'
                                            >
                                                <span aria-hidden>🎒</span>
                                            </button>
                                        )}
                                        {wp.crew_allowed && (() => {
                                            const dest = nextCrewAfter(wp)
                                            if (!dest) return null
                                            return (
                                                <a
                                                    href={`https://www.google.com/maps/dir/?api=1&origin=${wp.lat},${wp.lon}&destination=${dest.lat},${dest.lon}&travelmode=driving`}
                                                    target='_blank'
                                                    rel='noopener noreferrer'
                                                    title={`Directions to ${dest.name}`}
                                                    aria-label={`Directions from ${wp.name} to ${dest.name}`}
                                                    className='p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-blue-300'
                                                >
                                                    <Navigation2 className='w-4 h-4' />
                                                </a>
                                            )
                                        })()}
                                        {canLogCheckins && (
                                            <button
                                                onClick={() => openCheckin(wp)}
                                                className='text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                                            >
                                                Log
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            </main>

            {/* Sticky check-in CTA */}
            {canLogCheckins && nextWaypoint && !showCheckin && (
                <div className='sticky bottom-0 inset-x-0 bg-neutral-950/95 backdrop-blur border-t border-neutral-800 p-3'>
                    <div className='max-w-3xl mx-auto'>
                        <button
                            onClick={() => openCheckin(nextWaypoint)}
                            className='w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded py-3 font-semibold'
                        >
                            Log arrival at {nextWaypoint.name}
                        </button>
                    </div>
                </div>
            )}

            {/* Check-in modal */}
            {showCheckin && (
                <div className='fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3'>
                    <div className='bg-neutral-900 rounded-lg w-full max-w-md p-4 space-y-3'>
                        <div className='flex items-center justify-between'>
                            <div className='font-semibold'>Log runner arrival</div>
                            <button
                                onClick={() => setShowCheckin(false)}
                                className='text-neutral-400 hover:text-white'
                            >
                                Cancel
                            </button>
                        </div>
                        <label className='block text-sm'>
                            <span className='text-neutral-400 text-xs'>Aid station</span>
                            <select
                                value={checkinWaypointId}
                                onChange={e => setCheckinWaypointId(e.target.value)}
                                className='mt-1 w-full bg-neutral-800 rounded px-2 py-2'
                            >
                                {waypoints.map(w => (
                                    <option key={w.id} value={w.id}>{w.name} · mile {w.mile.toFixed(1)}</option>
                                ))}
                            </select>
                        </label>
                        <div className='grid grid-cols-2 gap-2'>
                            <label className='block text-sm'>
                                <span className='text-neutral-400 text-xs'>Date</span>
                                <input
                                    type='date'
                                    value={checkinDate}
                                    onChange={e => setCheckinDate(e.target.value)}
                                    className='mt-1 w-full bg-neutral-800 rounded px-2 py-2'
                                />
                            </label>
                            <label className='block text-sm'>
                                <span className='text-neutral-400 text-xs'>Time</span>
                                <input
                                    type='time'
                                    value={checkinTime}
                                    onChange={e => setCheckinTime(e.target.value)}
                                    className='mt-1 w-full bg-neutral-800 rounded px-2 py-2'
                                />
                            </label>
                        </div>
                        <button
                            onClick={submitCheckin}
                            className='w-full bg-emerald-600 hover:bg-emerald-500 rounded py-3 font-semibold'
                        >
                            Save arrival
                        </button>
                    </div>
                </div>
            )}

            {/* Drop bag detail modal */}
            {dropBagWaypoint && (
                <div
                    className='fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3'
                    onClick={() => setDropBagWaypoint(null)}
                >
                    <div
                        className='bg-neutral-900 rounded-lg w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-y-auto'
                        onClick={e => e.stopPropagation()}
                    >
                        <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <div className='font-semibold flex items-center gap-2'>
                                    <span className='text-base leading-none shrink-0' aria-hidden>🎒</span>
                                    <span className='truncate'>Drop bag · {dropBagWaypoint.name}</span>
                                </div>
                                <div className='text-xs text-neutral-400 mt-0.5'>
                                    Mile {dropBagWaypoint.mile.toFixed(1)}
                                    {dropBagWaypoint.drop_bag_name ? ` · ${dropBagWaypoint.drop_bag_name}` : ''}
                                </div>
                            </div>
                            <button
                                onClick={() => setDropBagWaypoint(null)}
                                className='text-neutral-400 hover:text-white shrink-0'
                            >
                                Close
                            </button>
                        </div>

                        <DropBagSummary waypoint={dropBagWaypoint} />
                        <DropBagNotes waypoint={dropBagWaypoint} showEmpty />
                    </div>
                </div>
            )}
        </div>
    )
}

function formatHM(min: number): string {
    if (!isFinite(min)) return '—'
    const total = Math.max(0, Math.round(min))
    const h = Math.floor(total / 60)
    const m = total % 60
    if (h === 0) return `${m}m`
    return `${h}h ${m.toString().padStart(2, '0')}m`
}
