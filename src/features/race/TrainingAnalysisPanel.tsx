import { useEffect, useMemo, useState } from 'react'
import { Activity, Link2, LoaderCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { STRAVA_RETURN_TO_STORAGE_KEY } from '@/features/auth/StravaCallback'
import { messageFromFunctionError } from '@/features/auth/strava-function-error'
import type { Race, Waypoint } from '@/types/database'
import type { PacePlanResult } from './pace-utils'
import type { TrainingRouteRow } from './useTrainingRoutes'
import {
  type ActivityCourseSlice,
  buildActivityCourseSegments,
  buildTrainingPlanSummary,
  formatDurationWords,
  getActivityCourseSlices,
  getActivitySliceMovingMinutes,
  getTrainingAnalysisDelta,
  getTrainingSegmentMovingMinutes,
  isSameTrainingOverlap,
} from './training-analysis'
import { getOverlapRacePace } from './race-day-utils'

export interface StravaActivity {
  id: number
  name: string
  elapsedSeconds: number
  movingSeconds: number
  distanceMiles: number | null
  startDate: string | null
  stream?: {
    distanceMeters: number[]
    elapsedSeconds: number[]
    moving: boolean[]
    latlng?: [number, number][]
  } | null
  courseSegments?: ActivityCourseSlice[]
}

interface StravaConnectionStatus {
  connected: boolean
  athleteName?: string
}

interface TrainingAnalysisPanelProps {
  routes: TrainingRouteRow[]
  planA: PacePlanResult | null
  planAGoalMinutes: number
  race: Race
  clock24h: boolean
  aidStations?: Pick<Waypoint, 'name' | 'mile' | 'type'>[]
  hideRoutePicker?: boolean
  highlightedOverlap?: { trainingStartMi: number; trainingEndMi: number } | null
  onHighlightOverlap?: (segment: { trainingStartMi: number; trainingEndMi: number }) => void
  savedActivityInputs?: string[]
  savedActivityResults?: StravaActivity[]
  onSaveActivityInputs?: (inputs: string[]) => Promise<void>
  onSaveActivityResults?: (results: StravaActivity[]) => Promise<void>
  courseCoordinates: [number, number][]
}

export function TrainingAnalysisPanel({
  routes,
  planA,
  race,
  clock24h,
  aidStations = [],
  hideRoutePicker = false,
  highlightedOverlap = null,
  onHighlightOverlap,
  savedActivityInputs = [],
  savedActivityResults = [],
  onSaveActivityInputs,
  onSaveActivityResults,
  courseCoordinates,
}: TrainingAnalysisPanelProps) {
  const savedActivityInputValue = savedActivityInputs.join('\n')
  const savedActivityResultsValue = JSON.stringify(savedActivityResults)
  const [routeId, setRouteId] = useState(routes[0]?.id ?? '')
  const [activityInput, setActivityInput] = useState(savedActivityInputValue)
  const [activities, setActivities] = useState<StravaActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<StravaConnectionStatus | null>(null)
  const [activeActivityId, setActiveActivityId] = useState<number | null>(null)

  useEffect(() => {
    setActivityInput(savedActivityInputValue)
    setActivities(JSON.parse(savedActivityResultsValue) as StravaActivity[])
  }, [savedActivityInputValue, savedActivityResultsValue])

  useEffect(() => {
    setActiveActivityId(current => activities.some(activity => activity.id === current) ? current : activities[0]?.id ?? null)
  }, [activities])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke('strava-activity', {
        body: { action: 'connection' },
      })
      if (!cancelled) setConnectionStatus(!invokeError && data?.connected ? data as StravaConnectionStatus : { connected: false })
    })()
    return () => { cancelled = true }
  }, [])

  const selectedRoute = routes.find(route => route.id === routeId) ?? routes[0] ?? null
  const summary = useMemo(
    () =>
      selectedRoute
        ? buildTrainingPlanSummary(selectedRoute.overlapSegments, planA, race, clock24h, aidStations)
        : null,
    [selectedRoute, planA, race, clock24h, aidStations]
  )
  const activeActivity = activities.find(activity => activity.id === activeActivityId) ?? activities[0] ?? null
  const activityComparisons = useMemo(() => {
    if (!summary || !activeActivity) return []
    return summary.segments.map(segment => {
      const slices = activeActivity.courseSegments?.length
        ? getActivityCourseSlices(segment, activeActivity.courseSegments)
        : [segment]
      if (slices.length === 0) return null
      const movingParts = slices.map(slice => activeActivity.courseSegments?.length
        ? getActivitySliceMovingMinutes(slice, activeActivity.stream)
        : getTrainingSegmentMovingMinutes(
            activeActivity.movingSeconds,
            activeActivity.distanceMiles,
            slice,
            activeActivity.stream
          ))
      if (movingParts.some(value => value == null)) return null
      const movingMinutes = movingParts.filter((value): value is number => value != null)
        .reduce((total, value) => total + value, 0)
      const planParts = activeActivity.courseSegments?.length
        ? slices.map(slice => getOverlapRacePace(planA, slice.courseStartMi, slice.courseEndMi, race, clock24h)?.durationMin ?? null)
        : [segment.raceDurationMinutes]
      if (planParts.some(value => value == null)) return null
      const planMinutes = planParts.filter((value): value is number => value != null)
        .reduce((total, value) => total + value, 0)
      return {
        movingMinutes,
        delta: getTrainingAnalysisDelta(movingMinutes, planMinutes),
        spatiallyMatched: Boolean(activeActivity.courseSegments?.length),
      }
    })
  }, [activeActivity, clock24h, planA, race, summary])
  const analyzeActivity = async () => {
    if (!activityInput.trim()) {
      setError('Paste a Strava activity link or enter its numeric activity ID.')
      return
    }
    if (!summary?.segments.some(segment => segment.raceDurationMinutes != null)) {
      setError('Set a valid Plan A goal before comparing a training activity.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const requestedActivities = activityInput.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
      if (onSaveActivityInputs) await onSaveActivityInputs(requestedActivities)
      const results: StravaActivity[] = []
      for (const requestedActivity of requestedActivities) {
        const { data, error: invokeError } = await supabase.functions.invoke('strava-activity', {
          body: { activity: requestedActivity },
        })
        if (invokeError) throw invokeError
        if (!data?.movingSeconds || !data?.distanceMiles) throw new Error(data?.error || 'Strava activity needs moving time and distance')
        const loaded = data as StravaActivity
        const courseSegments = buildActivityCourseSegments(
          loaded.stream?.latlng,
          loaded.distanceMiles,
          courseCoordinates,
          loaded.stream?.elapsedSeconds
        )
        results.push({
          ...loaded,
          stream: loaded.stream ? {
            distanceMeters: loaded.stream.distanceMeters,
            elapsedSeconds: loaded.stream.elapsedSeconds,
            moving: loaded.stream.moving,
          } : null,
          ...(courseSegments.length > 0 ? { courseSegments } : {}),
        })
      }
      if (onSaveActivityResults) await onSaveActivityResults(results)
      setActivities(results)
    } catch (caught) {
      setActivities([])
      setError(await messageFromFunctionError(caught, 'Unable to load Strava activity'))
    } finally {
      setLoading(false)
    }
  }

  const connectStrava = async () => {
    setConnecting(true)
    setError(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('strava-auth', {
        body: {
          action: 'start',
          mode: 'connect',
          redirectUrl: `${window.location.origin}/auth/strava/callback`,
        },
      })
      if (invokeError) throw invokeError
      if (!data?.state || !data?.url) throw new Error('Unable to start Strava connection')
      sessionStorage.setItem('strava_oauth_state', data.state)
      sessionStorage.setItem(
        STRAVA_RETURN_TO_STORAGE_KEY,
        `${window.location.pathname}${window.location.search}`
      )
      window.location.assign(data.url)
    } catch (caught) {
      setError(await messageFromFunctionError(caught, 'Unable to start Strava connection'))
      setConnecting(false)
    }
  }

  if (routes.length === 0) return null

  return (
    <section className="mt-10 border-t border-neutral-800 pt-8" aria-labelledby="training-plan-title">
      <div className="mb-5">
        <h2 id="training-plan-title" className="text-xl font-semibold text-white">Route plan</h2>
        <p className="mt-1 text-sm text-neutral-400">Your route, its on-course sections, and Plan A targets in one place.</p>
      </div>

      {summary ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <SummaryMetric label="Training route" value={`${selectedRoute?.distance_miles?.toFixed(1) ?? '—'} mi`} detail={selectedRoute?.elevation_gain_ft != null ? `+${Math.round(selectedRoute.elevation_gain_ft).toLocaleString()} ft` : undefined} />
            <SummaryMetric label="On the race course" value={`${summary.raceMilesTotal.toFixed(1)} mi`} detail={`${summary.segments.length} ${summary.segments.length === 1 ? 'section' : 'sections'}`} />
            <SummaryMetric label="Plan A on-course time" value={summary.raceDurationLabel ?? 'Generate Plan A'} detail="Excludes aid-station stops at section starts" />
          </dl>

          {activeActivity && (
            <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 px-3 py-2 text-sm text-blue-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Comparing <span className="font-medium">{activeActivity.name}</span> using Strava moving time.</span>
                {activities.length > 1 && <label className="flex items-center gap-2 text-xs text-blue-200"><span>Run</span><select value={activeActivity.id} onChange={event => setActiveActivityId(Number(event.target.value))} className="max-w-52 rounded border border-blue-800 bg-neutral-950 px-2 py-1 text-xs text-white">{activities.map(activity => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label>}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <div className="border-b border-neutral-800 px-4 py-3">
              <h3 className="font-medium text-white">On-course sections</h3>
              <p className="mt-0.5 text-xs text-neutral-500">Select a section to highlight it on the map. Non-consecutive training miles stay separate.</p>
            </div>
            <ul className="divide-y divide-neutral-800">
              {summary.segments.map((segment, index) => {
                const comparison = activityComparisons[index]
                const selected = isSameTrainingOverlap(highlightedOverlap, segment)
                return (
                  <li key={`${segment.courseMilesLabel}-${segment.trainingMilesLabel}`}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onHighlightOverlap?.(segment)}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${selected ? 'bg-yellow-400/10' : 'hover:bg-neutral-800/60'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div>
                          <p className="font-medium text-white">{segment.sectionLabel || `Section ${index + 1}`}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">Race mi {segment.courseMilesLabel} · Training mi {segment.trainingMilesLabel}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-xs uppercase tracking-wide text-neutral-500">Plan A</p>
                          <p className="font-medium text-emerald-300">{segment.raceDurationLabel ?? '—'}</p>
                        </div>
                      </div>
                      {comparison && (
                        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-neutral-800 pt-3 text-sm sm:max-w-md sm:ml-auto">
                          <div><p className="text-xs text-neutral-500">Your moving time</p><p className="font-medium text-white">{formatDurationWords(comparison.movingMinutes)}</p></div>
                          <div><p className="text-xs text-neutral-500">{comparison.spatiallyMatched ? 'Against matched Plan A' : 'Against Plan A'}</p><p className={comparison.delta.tone === 'faster' ? 'font-medium text-emerald-300' : comparison.delta.tone === 'slower' ? 'font-medium text-orange-300' : 'font-medium text-neutral-200'}>{comparison.delta.label}</p></div>
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : <p className="text-sm text-neutral-500">This route has no detected course overlap yet.</p>}

      <details className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50" open={activities.length > 0}>
        <summary className="cursor-pointer px-4 py-3 font-medium text-white marker:text-orange-300">Compare a completed Strava run</summary>
        <div className="border-t border-neutral-800 p-4">
          <div className={`grid grid-cols-1 ${hideRoutePicker ? 'lg:grid-cols-[minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]'} gap-3 items-end`}>
            {!hideRoutePicker && <label className="block"><span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Training route</span><select value={selectedRoute?.id ?? ''} onChange={event => { setRouteId(event.target.value); setActivities([]); setError(null) }} className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-400">{routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>}
            <label className="block"><span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Strava run</span><div className="relative"><Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" aria-hidden /><textarea value={activityInput} onChange={event => setActivityInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void analyzeActivity() }} rows={3} placeholder="Paste one Strava activity link or ID per line" className="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-400 resize-y" /></div></label>
            <button type="button" onClick={() => void analyzeActivity()} disabled={loading || !summary?.segments.some(segment => segment.raceDurationMinutes != null)} className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium">{loading && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden />}Analyze runs</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500"><p>{connectionStatus?.connected ? <>Connected as <span className="font-medium text-emerald-300">{connectionStatus.athleteName}</span> on Strava.</> : connectionStatus ? 'No Strava account connected.' : 'Checking Strava connection…'} Your account is connected only to your signed-in DFIU account.</p><button type="button" onClick={() => void connectStrava()} disabled={connecting} className="inline-flex items-center gap-1.5 text-orange-300 hover:text-orange-200 font-medium disabled:opacity-50"><Activity className="w-3.5 h-3.5" aria-hidden />{connecting ? 'Opening Strava…' : 'Connect / reconnect Strava'}</button></div>
          {error && <div className="mt-4 rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200"><p>{error}</p>{error.toLowerCase().includes('connect strava') && <button type="button" onClick={() => void connectStrava()} disabled={connecting} className="mt-2 inline-flex items-center gap-2 text-orange-300 hover:text-orange-200 font-medium disabled:opacity-50"><Activity className="w-4 h-4" aria-hidden />{connecting ? 'Opening Strava…' : 'Connect Strava'}</button>}</div>}
        </div>
      </details>
    </section>
  )
}

function SummaryMetric({
  label,
  value,
  detail,
  selected = false,
  onSelect,
}: {
  label: string
  value: string
  detail?: string
  selected?: boolean
  onSelect?: () => void
}) {
  const className = `rounded-lg px-3 py-2.5 border ${
    selected
      ? 'bg-yellow-400/10 border-yellow-400/50'
      : 'bg-neutral-950/70 border-neutral-800'
  }${onSelect ? ' w-full text-left transition-colors hover:border-neutral-600' : ''}`
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-neutral-100 font-medium">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-neutral-500">{detail}</p>}
    </>
  )
  if (onSelect) {
    return (
      <button type="button" aria-pressed={selected} onClick={onSelect} className={className}>
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}
