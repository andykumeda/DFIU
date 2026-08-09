import { useEffect, useMemo, useState } from 'react'
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Edit2,
    ExternalLink,
    MapPin,
    Plus,
    Radio,
    Save,
    Trash2,
    Users,
    X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { CrewMap } from './CrewMap'
import { useLatestRunnerLocation } from './useRunnerLocation'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { useRunnerCheckins } from './useRunnerCheckins'
import { calculatePacePlan, type ActualCheckin, type PacePlanResult } from './pace-utils'
import { DEFAULT_RUNNER_PROFILE, type RunnerPacingProfile } from './runner-profile'
import { parseResourcesConfig, resourcesConfigToRacePatch } from './resources-shared'
import { getBagKind, hasSavedBagPlan } from './drop-bag-shared'
import {
    formatDurationInput,
    formatHM,
    getCourseCoordinates,
    getElapsedMinutes,
    getPredictedMile,
    getRunnerLatLonAtMile,
    getRunnerMapFocus,
    parseDurationToMinutes,
    parseLocalDateTimeDraft,
    toLocalDateTimeDraft,
    type DateTimeDraft,
} from './race-day-utils'
import type {
    Course,
    Database,
    Json,
    Race,
    RaceLiveConfig,
    RaceLiveFollowedRunner,
    RaceLiveFollowedRunnerCheckin,
    TerrainNode,
    Waypoint,
} from '@/types/database'

interface LiveEventTabProps {
    raceId: string
    race: Race
    course: Course | null
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h: boolean
    runnerProfile: RunnerPacingProfile
    canEditRunnerIdentity: boolean
    canEditLive: boolean
    canEditLiveFeed: boolean
    onRaceUpdate: () => void | Promise<void>
}

type NewFollowerDraft = {
    name: string
    bibNumber: string
    finishTime: string
}

type FollowedRunnerPlan = {
    runner: RaceLiveFollowedRunner
    plan: PacePlanResult | null
    latestCheckin: RaceLiveFollowedRunnerCheckin | null
    nextArrival: PacePlanResult['waypointArrivals'][number] | null
}

type LiveFeedItem = {
    id: 'stream' | 'results'
    title: string
    openLabel: string
    url: string
    embedUrl: string | null
    iframeTitle: string
}

export function LiveEventTab({
    raceId,
    race,
    course,
    waypoints,
    terrainNodes,
    clock24h,
    runnerProfile,
    canEditRunnerIdentity,
    canEditLive,
    canEditLiveFeed,
    onRaceUpdate,
}: LiveEventTabProps) {
    const { profile } = useAuth() as { profile: { name?: string | null } | null }
    const { plans } = usePacePlans(raceId)
    const { checkins } = useRunnerCheckins(raceId)
    const { location: liveRunnerLocation, isFresh: liveRunnerLocationFresh } = useLatestRunnerLocation(raceId)
    const {
        liveConfig,
        followedRunners,
        followedCheckins,
        saveLiveConfig,
        addFollowedRunner,
        updateFollowedRunner,
        deleteFollowedRunner,
        upsertFollowedCheckin,
        deleteFollowedCheckin,
    } = useLiveEventData(raceId)

    const [now, setNow] = useState(() => Date.now())
    const [isEditingIdentity, setIsEditingIdentity] = useState(false)
    const [identityDraft, setIdentityDraft] = useState({ runnerName: '', bibNumber: '' })
    const [newFollower, setNewFollower] = useState<NewFollowerDraft>({ name: '', bibNumber: '', finishTime: '24:00' })
    const [followerDrafts, setFollowerDrafts] = useState<Record<string, NewFollowerDraft>>({})
    const [arrivalDrafts, setArrivalDrafts] = useState<Record<string, DateTimeDraft & { waypointId: string }>>({})
    const [expandedFollowerIds, setExpandedFollowerIds] = useState<Set<string>>(() => new Set())
    const [isEditingFeed, setIsEditingFeed] = useState(false)
    const [isSavingFeed, setIsSavingFeed] = useState(false)
    const [feedDraft, setFeedDraft] = useState({ url: '', embedUrl: '', resultsUrl: '', resultsEmbedUrl: '' })

    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 60_000)
        return () => window.clearInterval(t)
    }, [])

    const fallbackRunnerName = profile?.name?.trim() || 'Runner'
    const runnerName = liveConfig?.runner_name?.trim() || fallbackRunnerName
    const bibNumber = liveConfig?.bib_number?.trim() || ''

    const courseCoords = useMemo(() => getCourseCoordinates(course), [course])
    const planInputs = useMemo(() => {
        const samples = course?.elevation_samples as { distance: number; elevation: number }[] | null | undefined
        const total = course?.total_distance_miles ?? 0
        if (!samples || samples.length < 2 || total <= 0) return null
        return { samples, total }
    }, [course])

    const planAMinutes = useMemo(() => computePlanMinutes(plans, race.overall_cutoff).a, [plans, race.overall_cutoff])
    const baselinePlanA = useMemo(() => {
        if (!planInputs || planAMinutes <= 0) return null
        try {
            return calculatePacePlan(
                planInputs.samples,
                planInputs.total,
                waypoints,
                terrainNodes,
                { mode: 'time', value: planAMinutes },
                race,
                clock24h,
                [],
                runnerProfile,
                runnerProfile.aidStationDefaultDelay
            )
        } catch (err) {
            console.error('Live baseline plan failed', err)
            return null
        }
    }, [planInputs, planAMinutes, waypoints, terrainNodes, race, clock24h, runnerProfile])

    const mainPlan = useMemo(() => {
        if (!planInputs || planAMinutes <= 0) return null
        const actuals: ActualCheckin[] = checkins.map(c => ({ waypointId: c.waypoint_id, arrivedAt: new Date(c.arrived_at) }))
        try {
            return calculatePacePlan(
                planInputs.samples,
                planInputs.total,
                waypoints,
                terrainNodes,
                { mode: 'time', value: planAMinutes },
                race,
                clock24h,
                actuals,
                runnerProfile,
                runnerProfile.aidStationDefaultDelay
            )
        } catch (err) {
            console.error('Live plan failed', err)
            return null
        }
    }, [planInputs, planAMinutes, checkins, waypoints, terrainNodes, race, clock24h, runnerProfile])

    const elapsedMin = useMemo(() => getElapsedMinutes(race, now), [race, now])
    const predictedMile = useMemo(() => getPredictedMile(mainPlan, elapsedMin), [mainPlan, elapsedMin])
    const predictedRunnerLatLon = useMemo(() => getRunnerLatLonAtMile(course, predictedMile), [course, predictedMile])
    const runnerLatLon: [number, number] | null = liveRunnerLocation && liveRunnerLocationFresh
        ? [liveRunnerLocation.lon, liveRunnerLocation.lat]
        : predictedRunnerLatLon
    const mapFocus = useMemo(() => getRunnerMapFocus(course?.total_distance_miles, predictedMile, 4), [course?.total_distance_miles, predictedMile])
    const mapWaypoints = useMemo(() => {
        return waypoints.filter(w => w.type === 'aid_station').map(w => {
            const bagKind = getBagKind(w)
            const showBagIcon = !!bagKind && (bagKind !== 'crew' || hasSavedBagPlan(w))
            return {
                id: w.id,
                name: w.name,
                lat: w.lat,
                lon: w.lon,
                mile: w.mile,
                type: w.type,
                has_drop_bag: w.has_drop_bag,
                crew_allowed: w.crew_allowed,
                pacer_allowed: w.pacer_allowed,
                bag_kind: showBagIcon ? bagKind : null,
            }
        })
    }, [waypoints])
    const nextWaypoint = useMemo(() => {
        return [...waypoints].sort((a, b) => a.mile - b.mile).find(w => w.mile > predictedMile + 0.05) ?? null
    }, [waypoints, predictedMile])
    const liveTracking = useMemo(() => getLiveTrackingResource(race), [race])
    const liveResults = useMemo(() => getLiveResultsResource(race), [race])
    const trackingUrl = liveTracking?.url ?? null
    const liveResultsUrl = liveResults?.url ?? null
    const trackingEmbedUrl = useMemo(() => {
        if (!liveTracking) return null
        return (liveTracking.embedUrl ? getEmbeddableLiveUrl(liveTracking.embedUrl) : null) ?? getEmbeddableLiveUrl(liveTracking.url)
    }, [liveTracking])
    const liveResultsEmbedUrl = useMemo(() => {
        if (!liveResults) return null
        return (liveResults.embedUrl ? getEmbeddableLiveUrl(liveResults.embedUrl) : null) ?? getEmbeddableLiveUrl(liveResults.url)
    }, [liveResults])

    const lastCheckin = checkins.length > 0 ? checkins[checkins.length - 1] : null
    const lastCheckinWaypoint = lastCheckin ? waypoints.find(w => w.id === lastCheckin.waypoint_id) : null
    const statusDeltaMin = useMemo(() => {
        if (!lastCheckin || !baselinePlanA || !race.start_datetime) return null
        const planned = baselinePlanA.waypointArrivals.find(a => a.waypointId === lastCheckin.waypoint_id)
        if (!planned) return null
        const actualElapsed = (new Date(lastCheckin.arrived_at).getTime() - new Date(race.start_datetime).getTime()) / 60000
        if (!Number.isFinite(actualElapsed)) return null
        return Math.round(actualElapsed - planned.arrivalTime)
    }, [lastCheckin, baselinePlanA, race.start_datetime])
    const projectedDeltaMin = mainPlan && planAMinutes > 0 ? Math.round(mainPlan.totalTime - planAMinutes) : null

    const followedPlans = useMemo<FollowedRunnerPlan[]>(() => {
        if (!planInputs) {
            return followedRunners.map(runner => ({ runner, plan: null, latestCheckin: null, nextArrival: null }))
        }
        return followedRunners.map(runner => {
            const runnerCheckins = followedCheckins
                .filter(c => c.followed_runner_id === runner.id)
                .sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))
            const actuals: ActualCheckin[] = runnerCheckins.map(c => ({ waypointId: c.waypoint_id, arrivedAt: new Date(c.arrived_at) }))
            try {
                const plan = calculatePacePlan(
                    planInputs.samples,
                    planInputs.total,
                    waypoints,
                    terrainNodes,
                    { mode: 'time', value: runner.predicted_finish_minutes },
                    race,
                    clock24h,
                    actuals,
                    DEFAULT_RUNNER_PROFILE,
                    DEFAULT_RUNNER_PROFILE.aidStationDefaultDelay
                )
                const nextArrival = plan.waypointArrivals.find(a => a.arrivalTime > elapsedMin + 0.01) ?? plan.waypointArrivals[plan.waypointArrivals.length - 1] ?? null
                return {
                    runner,
                    plan,
                    latestCheckin: runnerCheckins[runnerCheckins.length - 1] ?? null,
                    nextArrival,
                }
            } catch (err) {
                console.error('Followed runner plan failed', err)
                return {
                    runner,
                    plan: null,
                    latestCheckin: runnerCheckins[runnerCheckins.length - 1] ?? null,
                    nextArrival: null,
                }
            }
        })
    }, [planInputs, followedRunners, followedCheckins, waypoints, terrainNodes, race, clock24h, elapsedMin])

    const saveIdentity = async () => {
        if (!canEditRunnerIdentity) return
        try {
            await saveLiveConfig(identityDraft.runnerName.trim() || null, identityDraft.bibNumber.trim() || null)
            setIsEditingIdentity(false)
            toast.success('Live runner updated')
        } catch (err) {
            toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`)
        }
    }

    const startEditingFeed = () => {
        setFeedDraft({
            url: trackingUrl ?? '',
            embedUrl: liveTracking?.embedUrl ?? '',
            resultsUrl: liveResultsUrl ?? '',
            resultsEmbedUrl: liveResults?.embedUrl ?? '',
        })
        setIsEditingFeed(true)
    }

    const saveLiveFeed = async () => {
        if (!canEditLiveFeed) return
        const url = feedDraft.url.trim()
        const embedUrl = feedDraft.embedUrl.trim()
        const resultsUrl = feedDraft.resultsUrl.trim()
        const resultsEmbedUrl = feedDraft.resultsEmbedUrl.trim()
        const normalizedUrl = url ? normalizeHttpUrl(url) : ''
        const normalizedEmbedUrl = embedUrl ? normalizeHttpUrl(embedUrl) : ''
        const normalizedResultsUrl = resultsUrl ? normalizeHttpUrl(resultsUrl) : ''
        const normalizedResultsEmbedUrl = resultsEmbedUrl ? normalizeHttpUrl(resultsEmbedUrl) : ''
        if (url && !normalizedUrl) {
            toast.error('Enter a valid stream URL')
            return
        }
        if (embedUrl && !normalizedEmbedUrl) {
            toast.error('Enter a valid stream embed URL')
            return
        }
        if (resultsUrl && !normalizedResultsUrl) {
            toast.error('Enter a valid results URL')
            return
        }
        if (resultsEmbedUrl && !normalizedResultsEmbedUrl) {
            toast.error('Enter a valid results embed URL')
            return
        }

        setIsSavingFeed(true)
        try {
            const config = parseResourcesConfig(race.resources_config, race)
            const nextLinks = config.links.map(link => {
                if (link.id === 'tracking_url') {
                    return {
                        ...link,
                        url: normalizedUrl || '',
                        embed_url: normalizedEmbedUrl || '',
                        enabled: !!normalizedUrl,
                    }
                }
                if (link.id === 'live_results_url') {
                    return {
                        ...link,
                        url: normalizedResultsUrl || '',
                        embed_url: normalizedResultsEmbedUrl || '',
                        enabled: !!normalizedResultsUrl,
                    }
                }
                return link
            })
            const nextConfig = { ...config, links: nextLinks }
            const legacyPatch = resourcesConfigToRacePatch(nextConfig)

            const racePatch: Database['public']['Tables']['races']['Update'] = {
                ...legacyPatch,
                resources_config: nextConfig as unknown as Json,
            }

            const { error } = await supabase
                .from('races')
                .update(racePatch)
                .eq('id', race.id)

            if (error) throw error
            await onRaceUpdate()
            setIsEditingFeed(false)
            toast.success('Live feed updated')
        } catch (err) {
            toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`)
        } finally {
            setIsSavingFeed(false)
        }
    }

    const submitNewFollower = async () => {
        const finishMinutes = parseDurationToMinutes(newFollower.finishTime)
        if (!newFollower.name.trim()) {
            toast.error('Enter a runner name')
            return
        }
        if (!finishMinutes) {
            toast.error('Enter finish time as HH:MM')
            return
        }
        try {
            await addFollowedRunner({
                name: newFollower.name.trim(),
                bibNumber: newFollower.bibNumber.trim() || null,
                predictedFinishMinutes: finishMinutes,
            })
            setNewFollower({ name: '', bibNumber: '', finishTime: formatDurationInput(finishMinutes) })
            toast.success('Runner added')
        } catch (err) {
            toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`)
        }
    }

    const getFollowerDraft = (runner: RaceLiveFollowedRunner): NewFollowerDraft => {
        return followerDrafts[runner.id] ?? {
            name: runner.name,
            bibNumber: runner.bib_number ?? '',
            finishTime: formatDurationInput(runner.predicted_finish_minutes),
        }
    }

    const updateFollowerDraft = (runner: RaceLiveFollowedRunner, patch: Partial<NewFollowerDraft>) => {
        setFollowerDrafts(prev => ({
            ...prev,
            [runner.id]: { ...getFollowerDraft(runner), ...patch },
        }))
    }

    const saveFollower = async (runner: RaceLiveFollowedRunner) => {
        const draft = getFollowerDraft(runner)
        const finishMinutes = parseDurationToMinutes(draft.finishTime)
        if (!draft.name.trim()) {
            toast.error('Enter a runner name')
            return
        }
        if (!finishMinutes) {
            toast.error('Enter finish time as HH:MM')
            return
        }
        try {
            await updateFollowedRunner(runner.id, {
                name: draft.name.trim(),
                bibNumber: draft.bibNumber.trim() || null,
                predictedFinishMinutes: finishMinutes,
            })
            setFollowerDrafts(prev => {
                const next = { ...prev }
                delete next[runner.id]
                return next
            })
            toast.success('Runner updated')
        } catch (err) {
            toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`)
        }
    }

    const getArrivalDraft = (runnerId: string, waypointId: string): DateTimeDraft & { waypointId: string } => {
        return arrivalDrafts[runnerId] ?? { waypointId, ...toLocalDateTimeDraft() }
    }

    const updateArrivalDraft = (runnerId: string, waypointId: string, patch: Partial<DateTimeDraft & { waypointId: string }>) => {
        setArrivalDrafts(prev => ({
            ...prev,
            [runnerId]: { ...getArrivalDraft(runnerId, waypointId), ...patch },
        }))
    }

    const submitFollowerArrival = async (runnerId: string, waypointId: string) => {
        const draft = getArrivalDraft(runnerId, waypointId)
        const arrivedAt = parseLocalDateTimeDraft(draft)
        if (!draft.waypointId || !arrivedAt) {
            toast.error('Enter an aid station, date, and time')
            return
        }
        try {
            await upsertFollowedCheckin(runnerId, draft.waypointId, arrivedAt)
            toast.success('Arrival logged')
        } catch (err) {
            toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown'}`)
        }
    }

    const toggleFollowerAidStations = (runnerId: string) => {
        setExpandedFollowerIds(prev => {
            const next = new Set(prev)
            if (next.has(runnerId)) next.delete(runnerId)
            else next.add(runnerId)
            return next
        })
    }

    const liveFeedItems: LiveFeedItem[] = []
    if (trackingUrl) {
        liveFeedItems.push({
            id: 'stream',
            title: 'Live Stream',
            openLabel: 'Open stream',
            url: trackingUrl,
            embedUrl: trackingEmbedUrl,
            iframeTitle: `${race.name} live stream`,
        })
    }
    if (liveResultsUrl) {
        liveFeedItems.push({
            id: 'results',
            title: 'Live Results',
            openLabel: 'Open results',
            url: liveResultsUrl,
            embedUrl: liveResultsEmbedUrl,
            iframeTitle: `${race.name} live results`,
        })
    }
    const showLiveFeedPanel = isEditingFeed || liveFeedItems.length > 0
    const showMultipleLiveFeeds = liveFeedItems.length > 1
    const liveAndMapGridClass = showMultipleLiveFeeds
        ? 'grid grid-cols-1 gap-5'
        : `grid grid-cols-1 gap-5 ${showLiveFeedPanel ? 'xl:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]' : ''}`

    return (
        <div className='race-tab-page max-w-6xl mx-auto p-4 md:p-6 space-y-5 text-white'>
            <section className='border border-neutral-800 bg-neutral-900 rounded-lg p-4 md:p-5'>
                <div className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
                    <div className='min-w-0'>
                        {isEditingIdentity ? (
                            <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end'>
                                <label className='block text-sm'>
                                    <span className='text-xs text-neutral-400'>Runner</span>
                                    <input
                                        value={identityDraft.runnerName}
                                        onChange={e => setIdentityDraft(prev => ({ ...prev, runnerName: e.target.value }))}
                                        className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                                    />
                                </label>
                                <label className='block text-sm'>
                                    <span className='text-xs text-neutral-400'>Bib</span>
                                    <input
                                        value={identityDraft.bibNumber}
                                        onChange={e => setIdentityDraft(prev => ({ ...prev, bibNumber: e.target.value }))}
                                        className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                                    />
                                </label>
                                <div className='flex gap-2'>
                                    <button onClick={saveIdentity} className='inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500'>
                                        <Save className='h-4 w-4' />
                                        Save
                                    </button>
                                    <button onClick={() => setIsEditingIdentity(false)} className='rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800'>
                                        <X className='h-4 w-4' />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <h1 className='text-3xl md:text-4xl font-black leading-tight text-white'>{runnerName}</h1>
                                    {bibNumber && <span className='rounded border border-blue-700 bg-blue-950/60 px-2.5 py-1 text-sm font-bold text-blue-100'>Bib {bibNumber}</span>}
                                    {canEditRunnerIdentity && (
                                        <button
                                            onClick={() => {
                                                setIdentityDraft({ runnerName, bibNumber })
                                                setIsEditingIdentity(true)
                                            }}
                                            className='rounded border border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800'
                                        >
                                            Edit
                                        </button>
                                    )}
                                </div>
                                <div className='mt-2 flex flex-wrap gap-3 text-sm text-neutral-400'>
                                    {race.start_datetime && <span>Elapsed {formatHM(Math.max(0, elapsedMin))}</span>}
                                    <span>{liveRunnerLocationFresh ? 'Live GPS' : `Estimated mile ${predictedMile.toFixed(1)}`}</span>
                                    {nextWaypoint && <span>Next: {nextWaypoint.name}</span>}
                                </div>
                            </>
                        )}
                    </div>

                    <div className='grid grid-cols-3 gap-2 text-sm md:min-w-[24rem]'>
                        <StatusTile label='Plan A' value={planAMinutes > 0 ? formatHM(planAMinutes) : '--'} />
                        <StatusTile
                            label='Runner'
                            value={statusDeltaMin == null ? 'No actual' : statusDeltaMin > 0 ? `+${statusDeltaMin}m` : `${statusDeltaMin}m`}
                            tone={statusDeltaMin == null ? 'neutral' : statusDeltaMin > 0 ? 'amber' : 'green'}
                        />
                        <StatusTile
                            label='Finish'
                            value={projectedDeltaMin == null ? '--' : projectedDeltaMin > 0 ? `+${projectedDeltaMin}m` : `${projectedDeltaMin}m`}
                            tone={projectedDeltaMin == null ? 'neutral' : projectedDeltaMin > 0 ? 'amber' : 'green'}
                        />
                    </div>
                </div>
                {lastCheckin && lastCheckinWaypoint && (
                    <div className='mt-4 flex items-center gap-2 rounded border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100'>
                        <CheckCircle2 className='h-4 w-4 text-emerald-300' />
                        <span>Last actual: {lastCheckinWaypoint.name} at {formatRaceTime(lastCheckin.arrived_at, race.timezone, clock24h)}</span>
                    </div>
                )}
            </section>

            <div className={liveAndMapGridClass}>
                {showLiveFeedPanel && (
                <section className='border border-neutral-800 bg-neutral-900 rounded-lg overflow-hidden'>
                    <div className='flex flex-col gap-3 border-b border-neutral-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
                        <div className='flex items-center gap-2'>
                            <Radio className='h-4 w-4 text-red-300' />
                            <h2 className='text-sm font-semibold'>Live Updates</h2>
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                            {canEditLiveFeed && (
                                <button
                                    type='button'
                                    onClick={isEditingFeed ? () => setIsEditingFeed(false) : startEditingFeed}
                                    className='inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800'
                                >
                                    {isEditingFeed ? <X className='h-3.5 w-3.5' /> : <Edit2 className='h-3.5 w-3.5' />}
                                    {isEditingFeed ? 'Cancel' : 'Edit'}
                                </button>
                            )}
                            {liveFeedItems.map(item => (
                                <a key={item.id} href={item.url} target='_blank' rel='noopener noreferrer' className='inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800'>
                                    <ExternalLink className='h-3.5 w-3.5' />
                                    {item.openLabel}
                                </a>
                            ))}
                        </div>
                    </div>
                    {isEditingFeed && canEditLiveFeed && (
                        <div className='grid gap-2 border-b border-neutral-800 bg-neutral-950/50 px-4 py-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end'>
                            <label className='block text-sm'>
                                <span className='text-xs text-neutral-400'>Stream URL</span>
                                <input
                                    value={feedDraft.url}
                                    onChange={e => setFeedDraft(prev => ({ ...prev, url: e.target.value }))}
                                    className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                                />
                            </label>
                            <label className='block text-sm'>
                                <span className='text-xs text-neutral-400'>Stream embed URL</span>
                                <input
                                    value={feedDraft.embedUrl}
                                    onChange={e => setFeedDraft(prev => ({ ...prev, embedUrl: e.target.value }))}
                                    className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                                />
                            </label>
                            <label className='block text-sm'>
                                <span className='text-xs text-neutral-400'>Results URL</span>
                                <input
                                    value={feedDraft.resultsUrl}
                                    onChange={e => setFeedDraft(prev => ({ ...prev, resultsUrl: e.target.value }))}
                                    className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                                />
                            </label>
                            <label className='block text-sm'>
                                <span className='text-xs text-neutral-400'>Results embed URL</span>
                                <input
                                    value={feedDraft.resultsEmbedUrl}
                                    onChange={e => setFeedDraft(prev => ({ ...prev, resultsEmbedUrl: e.target.value }))}
                                    className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                                />
                            </label>
                            <button
                                type='button'
                                onClick={saveLiveFeed}
                                disabled={isSavingFeed}
                                className='inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2 lg:col-span-1'
                            >
                                <Save className='h-4 w-4' />
                                {isSavingFeed ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    )}
                    {liveFeedItems.length > 0 ? (
                        <div className={showMultipleLiveFeeds ? 'grid grid-cols-1 gap-3 p-3 xl:grid-cols-2' : ''}>
                            {liveFeedItems.map(item => (
                                <LiveFeedFrame key={item.id} item={item} showHeading={showMultipleLiveFeeds} />
                            ))}
                        </div>
                    ) : (
                        <div className='flex h-[220px] items-center justify-center px-4 text-center text-sm text-neutral-400'>
                            No live resources are configured for this event.
                        </div>
                    )}
                </section>
                )}

                <section className='border border-neutral-800 bg-neutral-900 rounded-lg overflow-hidden'>
                    <div className='flex items-center justify-between border-b border-neutral-800 px-4 py-3'>
                        <div className='flex items-center gap-2'>
                            <MapPin className='h-4 w-4 text-amber-300' />
                            <h2 className='text-sm font-semibold'>Runner Location</h2>
                        </div>
                        <div className='flex items-center gap-2'>
                            {canEditLiveFeed && !showLiveFeedPanel && (
                                <button
                                    type='button'
                                    onClick={startEditingFeed}
                                    className='inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800'
                                >
                                    <Plus className='h-3.5 w-3.5' />
                                    Add feed
                                </button>
                            )}
                            <span className='text-xs text-neutral-500'>{course?.total_distance_miles?.toFixed(1) ?? '--'} mi</span>
                        </div>
                    </div>
                    <div className='h-[420px] md:h-[560px]'>
                        <CrewMap
                            coordinates={courseCoords}
                            waypoints={mapWaypoints}
                            runnerLatLon={runnerLatLon}
                            nextWaypointId={nextWaypoint?.id ?? null}
                            focusStartMile={mapFocus?.startMile ?? null}
                            focusEndMile={mapFocus?.endMile ?? null}
                        />
                    </div>
                    <div className='border-t border-neutral-800 px-4 py-2 text-xs text-neutral-400'>
                        {liveRunnerLocationFresh && liveRunnerLocation
                            ? `GPS updated ${formatRaceTime(liveRunnerLocation.recorded_at, race.timezone, clock24h)}`
                            : `Estimated at mile ${predictedMile.toFixed(1)}`}
                    </div>
                </section>
            </div>

            <section className='border border-neutral-800 bg-neutral-900 rounded-lg p-4 md:p-5'>
                <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                    <div>
                        <div className='flex items-center gap-2'>
                            <Users className='h-4 w-4 text-blue-300' />
                            <h2 className='text-lg font-semibold'>Runners To Follow</h2>
                        </div>
                    </div>
                </div>

                {canEditLive && (
                    <div className='mb-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] md:items-end'>
                        <label className='block text-sm'>
                            <span className='text-xs text-neutral-400'>Runner</span>
                            <input
                                value={newFollower.name}
                                onChange={e => setNewFollower(prev => ({ ...prev, name: e.target.value }))}
                                className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                            />
                        </label>
                        <label className='block text-sm'>
                            <span className='text-xs text-neutral-400'>Bib</span>
                            <input
                                value={newFollower.bibNumber}
                                onChange={e => setNewFollower(prev => ({ ...prev, bibNumber: e.target.value }))}
                                className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-blue-500'
                            />
                        </label>
                        <label className='block text-sm'>
                            <span className='text-xs text-neutral-400'>Finish</span>
                            <input
                                value={newFollower.finishTime}
                                onChange={e => setNewFollower(prev => ({ ...prev, finishTime: e.target.value }))}
                                placeholder='24:00'
                                className='mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-white outline-none focus:border-blue-500'
                            />
                        </label>
                        <button onClick={submitNewFollower} className='inline-flex items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 font-semibold hover:bg-blue-500'>
                            <Plus className='h-4 w-4' />
                            Add
                        </button>
                    </div>
                )}

                {followedPlans.length === 0 ? (
                    <div className='rounded border border-dashed border-neutral-700 px-4 py-8 text-center text-sm text-neutral-400'>
                        No followed runners yet.
                    </div>
                ) : (
                    <div className='space-y-4'>
                        {followedPlans.map(item => {
                            const draft = getFollowerDraft(item.runner)
                            const defaultWaypointId = item.nextArrival?.waypointId ?? waypoints[0]?.id ?? ''
                            const arrivalDraft = getArrivalDraft(item.runner.id, defaultWaypointId)
                            const aidStationsExpanded = expandedFollowerIds.has(item.runner.id)
                            const checkinsByWaypoint = new Map(
                                followedCheckins
                                    .filter(c => c.followed_runner_id === item.runner.id)
                                    .map(c => [c.waypoint_id, c])
                            )
                            return (
                                <article key={item.runner.id} className='rounded border border-neutral-800 bg-neutral-950/60 p-3 md:p-4'>
                                    <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                                        <div className='min-w-0'>
                                            {canEditLive ? (
                                                <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto_auto] sm:items-end'>
                                                    <label className='block text-sm'>
                                                        <span className='text-xs text-neutral-500'>Runner</span>
                                                        <input
                                                            value={draft.name}
                                                            onChange={e => updateFollowerDraft(item.runner, { name: e.target.value })}
                                                            className='mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-white outline-none focus:border-blue-500'
                                                        />
                                                    </label>
                                                    <label className='block text-sm'>
                                                        <span className='text-xs text-neutral-500'>Bib</span>
                                                        <input
                                                            value={draft.bibNumber}
                                                            onChange={e => updateFollowerDraft(item.runner, { bibNumber: e.target.value })}
                                                            className='mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-white outline-none focus:border-blue-500'
                                                        />
                                                    </label>
                                                    <label className='block text-sm'>
                                                        <span className='text-xs text-neutral-500'>Finish</span>
                                                        <input
                                                            value={draft.finishTime}
                                                            onChange={e => updateFollowerDraft(item.runner, { finishTime: e.target.value })}
                                                            className='mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-white outline-none focus:border-blue-500'
                                                        />
                                                    </label>
                                                    <button onClick={() => saveFollower(item.runner)} className='inline-flex items-center justify-center gap-1.5 rounded bg-neutral-800 px-2 py-1.5 text-sm font-medium hover:bg-neutral-700'>
                                                        <Save className='h-4 w-4' />
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (!window.confirm(`Remove ${item.runner.name}?`)) return
                                                            try {
                                                                await deleteFollowedRunner(item.runner.id)
                                                                toast.success('Runner removed')
                                                            } catch (err) {
                                                                toast.error(`Remove failed: ${err instanceof Error ? err.message : 'unknown'}`)
                                                            }
                                                        }}
                                                        className='inline-flex items-center justify-center rounded border border-red-900/70 px-2 py-1.5 text-red-300 hover:bg-red-950/40'
                                                        title='Remove runner'
                                                    >
                                                        <Trash2 className='h-4 w-4' />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className='flex flex-wrap items-center gap-2'>
                                                        <h3 className='text-xl font-bold'>{item.runner.name}</h3>
                                                        {item.runner.bib_number && <span className='rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300'>Bib {item.runner.bib_number}</span>}
                                                    </div>
                                                    <div className='mt-1 text-sm text-neutral-400'>Seed finish {formatHM(item.runner.predicted_finish_minutes)}</div>
                                                </>
                                            )}
                                        </div>

                                        <div className='grid grid-cols-3 gap-2 text-sm lg:min-w-[20rem]'>
                                            <StatusTile label='Seed' value={formatHM(item.runner.predicted_finish_minutes)} />
                                            <StatusTile label='Projected' value={item.plan ? formatHM(item.plan.totalTime) : '--'} tone='green' />
                                            <StatusTile label='Next' value={item.nextArrival?.timeOfDay ?? '--'} />
                                        </div>
                                    </div>

                                    {item.latestCheckin && (
                                        <div className='mt-3 text-sm text-neutral-400'>
                                            Last actual: {waypoints.find(w => w.id === item.latestCheckin?.waypoint_id)?.name ?? 'Aid station'} at {formatRaceTime(item.latestCheckin.arrived_at, race.timezone, clock24h)}
                                        </div>
                                    )}

                                    <button
                                        type='button'
                                        onClick={() => toggleFollowerAidStations(item.runner.id)}
                                        className='mt-4 flex w-full items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-sm font-semibold text-neutral-100 hover:bg-neutral-800'
                                        aria-expanded={aidStationsExpanded}
                                    >
                                        <span>Aid stations</span>
                                        <span className='flex items-center gap-2 text-xs text-neutral-400'>
                                            {item.plan?.waypointArrivals.length ?? 0} stops
                                            {aidStationsExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                                        </span>
                                    </button>

                                    {aidStationsExpanded && (
                                        <div className='mt-3'>
                                            {canEditLive && waypoints.length > 0 && (
                                                <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_8rem_auto] md:items-end'>
                                                    <label className='block text-sm'>
                                                        <span className='text-xs text-neutral-500'>Arrival aid station</span>
                                                        <select
                                                            value={arrivalDraft.waypointId}
                                                            onChange={e => updateArrivalDraft(item.runner.id, defaultWaypointId, { waypointId: e.target.value })}
                                                            className='mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-white outline-none focus:border-blue-500'
                                                        >
                                                            {waypoints.map(wp => (
                                                                <option key={wp.id} value={wp.id}>{wp.name} - mile {wp.mile.toFixed(1)}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className='block text-sm'>
                                                        <span className='text-xs text-neutral-500'>Date</span>
                                                        <input
                                                            type='date'
                                                            value={arrivalDraft.date}
                                                            onChange={e => updateArrivalDraft(item.runner.id, defaultWaypointId, { date: e.target.value })}
                                                            className='mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-white outline-none focus:border-blue-500'
                                                        />
                                                    </label>
                                                    <label className='block text-sm'>
                                                        <span className='text-xs text-neutral-500'>Time</span>
                                                        <input
                                                            type='time'
                                                            value={arrivalDraft.time}
                                                            onChange={e => updateArrivalDraft(item.runner.id, defaultWaypointId, { time: e.target.value })}
                                                            className='mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-white outline-none focus:border-blue-500'
                                                        />
                                                    </label>
                                                    <button onClick={() => submitFollowerArrival(item.runner.id, defaultWaypointId)} className='inline-flex items-center justify-center gap-2 rounded bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500'>
                                                        <CheckCircle2 className='h-4 w-4' />
                                                        Log
                                                    </button>
                                                </div>
                                            )}

                                            <div className='mt-4 overflow-x-auto'>
                                                <table className='min-w-full text-left text-sm'>
                                                    <thead className='text-xs uppercase text-neutral-500'>
                                                        <tr>
                                                            <th className='whitespace-nowrap py-2 pr-4 font-medium'>Aid station</th>
                                                            <th className='whitespace-nowrap py-2 pr-4 font-medium'>Mile</th>
                                                            <th className='whitespace-nowrap py-2 pr-4 font-medium'>ETA</th>
                                                            <th className='whitespace-nowrap py-2 pr-4 font-medium'>Actual</th>
                                                            {canEditLive && <th className='py-2 font-medium'></th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className='divide-y divide-neutral-800'>
                                                        {(item.plan?.waypointArrivals ?? []).map(arrival => {
                                                            const actual = checkinsByWaypoint.get(arrival.waypointId)
                                                            return (
                                                                <tr key={arrival.waypointId}>
                                                                    <td className='whitespace-nowrap py-2 pr-4 text-neutral-100'>{arrival.name}</td>
                                                                    <td className='whitespace-nowrap py-2 pr-4 text-neutral-400'>{arrival.mile.toFixed(1)}</td>
                                                                    <td className='whitespace-nowrap py-2 pr-4 font-mono text-emerald-200'>{arrival.timeOfDay}</td>
                                                                    <td className='whitespace-nowrap py-2 pr-4 text-neutral-300'>{actual ? formatRaceTime(actual.arrived_at, race.timezone, clock24h) : '--'}</td>
                                                                    {canEditLive && (
                                                                        <td className='py-2 text-right'>
                                                                            {actual && (
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        try {
                                                                                            await deleteFollowedCheckin(item.runner.id, arrival.waypointId)
                                                                                            toast.success('Arrival cleared')
                                                                                        } catch (err) {
                                                                                            toast.error(`Clear failed: ${err instanceof Error ? err.message : 'unknown'}`)
                                                                                        }
                                                                                    }}
                                                                                    className='rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white'
                                                                                >
                                                                                    Clear
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            )
                        })}
                    </div>
                )}
            </section>
        </div>
    )
}

function LiveFeedFrame({ item, showHeading }: { item: LiveFeedItem; showHeading: boolean }) {
    const content = item.embedUrl ? (
        <iframe
            title={item.iframeTitle}
            src={item.embedUrl}
            className='h-[420px] w-full bg-white md:h-[560px]'
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
            allowFullScreen
            referrerPolicy='strict-origin-when-cross-origin'
            sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts'
        />
    ) : (
        <div className='flex h-[220px] items-center justify-center px-4 text-center md:h-[320px]'>
            <a
                href={item.url}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-2 rounded bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500'
            >
                <ExternalLink className='h-4 w-4' />
                {item.openLabel}
            </a>
        </div>
    )

    if (!showHeading) return content

    return (
        <div className='overflow-hidden rounded border border-neutral-800 bg-neutral-950'>
            <div className='border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase text-neutral-400'>
                {item.title}
            </div>
            {content}
        </div>
    )
}

function StatusTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'green' | 'amber' }) {
    const toneClass = tone === 'green'
        ? 'text-emerald-200'
        : tone === 'amber'
            ? 'text-amber-200'
            : 'text-neutral-100'
    return (
        <div className='rounded border border-neutral-800 bg-neutral-950/80 px-3 py-2'>
            <div className='text-[11px] uppercase text-neutral-500'>{label}</div>
            <div className={`mt-0.5 truncate font-mono text-base font-semibold ${toneClass}`}>{value}</div>
        </div>
    )
}

function getLiveTrackingResource(race: Race): { url: string; embedUrl: string | null } | null {
    return getLiveResource(race, 'tracking_url', race.tracking_url)
}

function getLiveResultsResource(race: Race): { url: string; embedUrl: string | null } | null {
    return getLiveResource(race, 'live_results_url')
}

function getLiveResource(race: Race, resourceId: string, fallbackUrl?: string | null): { url: string; embedUrl: string | null } | null {
    const config = parseResourcesConfig(race.resources_config, race)
    const resource = config.links.find(link => link.id === resourceId && link.enabled && link.url.trim())
    const url = normalizeHttpUrl(resource?.url || fallbackUrl)
    if (!url) return null
    return {
        url,
        embedUrl: normalizeHttpUrl(resource?.embed_url),
    }
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
    if (!value) return null
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
    } catch {
        return null
    }
}

function getEmbeddableLiveUrl(value: string): string | null {
    try {
        const url = new URL(value)
        const host = url.hostname.replace(/^www\./, '')
        if (host === 'youtu.be') {
            const id = url.pathname.split('/').filter(Boolean)[0]
            return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
        }
        if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (url.pathname.startsWith('/embed/')) return url.href
            const channelId = url.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)(?:\/|$)/)?.[1]
            if (channelId && url.pathname.endsWith('/streams')) {
                return `https://www.youtube-nocookie.com/embed/live_stream?channel=${channelId}`
            }
            const videoId = url.searchParams.get('v')
            if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`
            return null
        }
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
    } catch {
        return null
    }
}

function formatRaceTime(value: string, timeZone: string | null | undefined, clock24h: boolean) {
    return new Date(value).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timeZone || undefined,
        hour12: !clock24h,
    })
}

function useLiveEventData(raceId: string) {
    const { user } = useAuth()
    const [liveConfig, setLiveConfig] = useState<RaceLiveConfig | null>(null)
    const [followedRunners, setFollowedRunners] = useState<RaceLiveFollowedRunner[]>([])
    const [followedCheckins, setFollowedCheckins] = useState<RaceLiveFollowedRunnerCheckin[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const [configRes, runnersRes, checkinsRes] = await Promise.all([
                supabase.from('race_live_configs').select('*').eq('race_id', raceId).maybeSingle(),
                supabase.from('race_live_followed_runners').select('*').eq('race_id', raceId).order('created_at', { ascending: true }),
                supabase.from('race_live_followed_runner_checkins').select('*').eq('race_id', raceId).order('arrived_at', { ascending: true }),
            ])
            if (cancelled) return
            if (!configRes.error) setLiveConfig(configRes.data as RaceLiveConfig | null)
            if (!runnersRes.error) setFollowedRunners((runnersRes.data as RaceLiveFollowedRunner[] | null) ?? [])
            if (!checkinsRes.error) setFollowedCheckins((checkinsRes.data as RaceLiveFollowedRunnerCheckin[] | null) ?? [])
        })()
        return () => { cancelled = true }
    }, [raceId])

    useEffect(() => {
        const channel = supabase
            .channel(`race_live:${raceId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'race_live_configs', filter: `race_id=eq.${raceId}` },
                payload => {
                    if (payload.eventType === 'DELETE') setLiveConfig(null)
                    else if (payload.new) setLiveConfig(payload.new as RaceLiveConfig)
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'race_live_followed_runners', filter: `race_id=eq.${raceId}` },
                payload => {
                    setFollowedRunners(prev => {
                        if (payload.eventType === 'DELETE' && payload.old) {
                            return prev.filter(r => r.id !== (payload.old as RaceLiveFollowedRunner).id)
                        }
                        if (payload.new) {
                            const row = payload.new as RaceLiveFollowedRunner
                            return [...prev.filter(r => r.id !== row.id), row].sort((a, b) => a.created_at.localeCompare(b.created_at))
                        }
                        return prev
                    })
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'race_live_followed_runner_checkins', filter: `race_id=eq.${raceId}` },
                payload => {
                    setFollowedCheckins(prev => {
                        if (payload.eventType === 'DELETE' && payload.old) {
                            return prev.filter(c => c.id !== (payload.old as RaceLiveFollowedRunnerCheckin).id)
                        }
                        if (payload.new) {
                            const row = payload.new as RaceLiveFollowedRunnerCheckin
                            return [...prev.filter(c => c.id !== row.id), row].sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))
                        }
                        return prev
                    })
                }
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [raceId])

    const saveLiveConfig = async (runnerName: string | null, bibNumber: string | null) => {
        const { data, error } = await supabase
            .from('race_live_configs')
            .upsert({
                race_id: raceId,
                runner_name: runnerName,
                bib_number: bibNumber,
                updated_by: user?.id ?? null,
            }, { onConflict: 'race_id' })
            .select('*')
            .single()
        if (error) throw error
        setLiveConfig(data as RaceLiveConfig)
    }

    const addFollowedRunner = async (input: { name: string; bibNumber: string | null; predictedFinishMinutes: number }) => {
        const { data, error } = await supabase
            .from('race_live_followed_runners')
            .insert({
                race_id: raceId,
                name: input.name,
                bib_number: input.bibNumber,
                predicted_finish_minutes: input.predictedFinishMinutes,
                created_by: user?.id ?? null,
                updated_by: user?.id ?? null,
            })
            .select('*')
            .single()
        if (error) throw error
        setFollowedRunners(prev => [...prev.filter(r => r.id !== data.id), data as RaceLiveFollowedRunner])
    }

    const updateFollowedRunner = async (id: string, input: { name: string; bibNumber: string | null; predictedFinishMinutes: number }) => {
        const { data, error } = await supabase
            .from('race_live_followed_runners')
            .update({
                name: input.name,
                bib_number: input.bibNumber,
                predicted_finish_minutes: input.predictedFinishMinutes,
                updated_by: user?.id ?? null,
            })
            .eq('id', id)
            .select('*')
            .single()
        if (error) throw error
        setFollowedRunners(prev => prev.map(r => r.id === id ? data as RaceLiveFollowedRunner : r))
    }

    const deleteFollowedRunner = async (id: string) => {
        const { error } = await supabase.from('race_live_followed_runners').delete().eq('id', id)
        if (error) throw error
        setFollowedRunners(prev => prev.filter(r => r.id !== id))
        setFollowedCheckins(prev => prev.filter(c => c.followed_runner_id !== id))
    }

    const upsertFollowedCheckin = async (followedRunnerId: string, waypointId: string, arrivedAt: Date) => {
        const { data, error } = await supabase
            .from('race_live_followed_runner_checkins')
            .upsert({
                race_id: raceId,
                followed_runner_id: followedRunnerId,
                waypoint_id: waypointId,
                arrived_at: arrivedAt.toISOString(),
                entered_by: user?.id ?? null,
            }, { onConflict: 'followed_runner_id,waypoint_id' })
            .select('*')
            .single()
        if (error) throw error
        setFollowedCheckins(prev => [...prev.filter(c => c.id !== data.id), data as RaceLiveFollowedRunnerCheckin].sort((a, b) => a.arrived_at.localeCompare(b.arrived_at)))
    }

    const deleteFollowedCheckin = async (followedRunnerId: string, waypointId: string) => {
        const { error } = await supabase
            .from('race_live_followed_runner_checkins')
            .delete()
            .eq('race_id', raceId)
            .eq('followed_runner_id', followedRunnerId)
            .eq('waypoint_id', waypointId)
        if (error) throw error
        setFollowedCheckins(prev => prev.filter(c => c.followed_runner_id !== followedRunnerId || c.waypoint_id !== waypointId))
    }

    return {
        liveConfig,
        followedRunners,
        followedCheckins,
        saveLiveConfig,
        addFollowedRunner,
        updateFollowedRunner,
        deleteFollowedRunner,
        upsertFollowedCheckin,
        deleteFollowedCheckin,
    }
}
