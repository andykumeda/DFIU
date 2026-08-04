import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, Link2, LoaderCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { STRAVA_RETURN_TO_STORAGE_KEY } from '@/features/auth/StravaCallback'
import { messageFromFunctionError } from '@/features/auth/strava-function-error'
import type { Race } from '@/types/database'
import type { PacePlanResult } from './pace-utils'
import type { TrainingRouteRow } from './useTrainingRoutes'
import {
  buildTrainingPlanSummary,
  formatDurationWords,
  getTrainingAnalysisDelta,
  getTrainingSegmentMovingMinutes,
} from './training-analysis'

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
  } | null
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
  hideRoutePicker?: boolean
  savedActivityInputs?: string[]
  savedActivityResults?: StravaActivity[]
  onSaveActivityInputs?: (inputs: string[]) => Promise<void>
  onSaveActivityResults?: (results: StravaActivity[]) => Promise<void>
}

export function TrainingAnalysisPanel({
  routes,
  planA,
  race,
  clock24h,
  hideRoutePicker = false,
  savedActivityInputs = [],
  savedActivityResults = [],
  onSaveActivityInputs,
  onSaveActivityResults,
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

  useEffect(() => {
    setActivityInput(savedActivityInputValue)
    setActivities(JSON.parse(savedActivityResultsValue) as StravaActivity[])
  }, [savedActivityInputValue, savedActivityResultsValue])

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
        ? buildTrainingPlanSummary(selectedRoute.overlapSegments, planA, race, clock24h)
        : null,
    [selectedRoute, planA, race, clock24h]
  )
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
        results.push(data as StravaActivity)
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
    <section className="mt-10 border-t border-neutral-800 pt-8" aria-labelledby="training-analysis-title">
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-300">
          <BarChart3 className="w-5 h-5" aria-hidden />
        </div>
        <div>
          <h2 id="training-analysis-title" className="text-xl font-semibold text-white">
            Training Analysis
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Compare your completed Strava run with the Plan A goal for its matching race segment.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 md:p-5">
        <div className={`grid grid-cols-1 ${hideRoutePicker ? 'lg:grid-cols-[minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto]'} gap-3 items-end`}>
          {!hideRoutePicker && <label className="block">
            <span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Training route</span>
            <select
              value={selectedRoute?.id ?? ''}
              onChange={event => {
                setRouteId(event.target.value)
                setActivities([])
                setError(null)
              }}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-orange-400"
            >
              {routes.map(route => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
          </label>}

          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Strava run</span>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" aria-hidden />
              <textarea
                value={activityInput}
                onChange={event => setActivityInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void analyzeActivity()
                }}
                rows={3}
                placeholder="Paste one Strava activity link or ID per line"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-400 resize-y"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={() => void analyzeActivity()}
            disabled={loading || !summary?.segments.some(segment => segment.raceDurationMinutes != null)}
            className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium"
          >
            {loading && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden />}
            Analyze runs
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <p>
            {connectionStatus?.connected
              ? <>Connected as <span className="font-medium text-emerald-300">{connectionStatus.athleteName}</span> on Strava.</>
              : connectionStatus ? 'No Strava account connected.' : 'Checking Strava connection…'}
            {' '}Your account is connected only to your signed-in DFIU account; it is never shared with this event&apos;s owner.
          </p>
          <button
            type="button"
            onClick={() => void connectStrava()}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 text-orange-300 hover:text-orange-200 font-medium disabled:opacity-50"
          >
            <Activity className="w-3.5 h-3.5" aria-hidden />
            {connecting ? 'Opening Strava…' : 'Connect / reconnect Strava'}
          </button>
        </div>

        {summary ? (
          <div className="mt-5">
            <p className="text-xs text-neutral-500 mb-3">
              Each matched section is analyzed separately. Non-consecutive training miles are never combined.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {summary.segments.map((segment, index) => (
                <SummaryMetric
                  key={`${segment.courseMilesLabel}-${segment.trainingMilesLabel}`}
                  label={`Section ${index + 1}: race mi ${segment.courseMilesLabel}`}
                  value={`Plan A ${segment.raceDurationLabel ?? 'not generated'}`}
                  detail={`training mi ${segment.trainingMilesLabel}`}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-neutral-500">
            This route has no detected course overlap yet.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">
            <p>{error}</p>
            {error.toLowerCase().includes('connect strava') && (
              <button
                type="button"
                onClick={() => void connectStrava()}
                disabled={connecting}
                className="mt-2 inline-flex items-center gap-2 text-orange-300 hover:text-orange-200 font-medium disabled:opacity-50"
              >
                <Activity className="w-4 h-4" aria-hidden />
                {connecting ? 'Opening Strava…' : 'Connect Strava'}
              </button>
            )}
          </div>
        )}

        {activities.map(activity => {
          if (!summary) return null
          const comparisons = summary.segments.flatMap((segment, index) => {
            const movingMinutes = getTrainingSegmentMovingMinutes(
              activity.movingSeconds,
              activity.distanceMiles,
              segment,
              activity.stream
            )
            if (movingMinutes == null || segment.raceDurationMinutes == null) return []
            return [{ segment, index, movingMinutes, delta: getTrainingAnalysisDelta(movingMinutes, segment.raceDurationMinutes) }]
          })
          if (comparisons.length === 0) return null
          return <div key={activity.id} className="mt-5 rounded-lg border border-neutral-700 bg-neutral-950/70 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{activity.name}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {activity.stream
                    ? 'Uses Strava moving-time data for each individual training section.'
                    : 'Uses Strava moving time, weighted separately for each individual training section.'}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {comparisons.map(({ segment, index, movingMinutes, delta }) => (
                <div key={`${segment.courseMilesLabel}-${segment.trainingMilesLabel}`} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-white">Section {index + 1}: race mi {segment.courseMilesLabel}</p>
                    <p className={delta.tone === 'faster' ? 'text-sm font-medium text-emerald-300' : delta.tone === 'slower' ? 'text-sm font-medium text-orange-300' : 'text-sm font-medium text-neutral-200'}>{delta.label}</p>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <SummaryMetric label="Training miles" value={`${segment.trainingMilesLabel} mi`} />
                    <SummaryMetric label="Moving time" value={formatDurationWords(movingMinutes)} />
                    <SummaryMetric label="Plan A time" value={segment.raceDurationLabel ?? '—'} />
                  </dl>
                </div>
              ))}
            </div>
          </div>
        })}
      </div>
    </section>
  )
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg bg-neutral-950/70 border border-neutral-800 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-neutral-100 font-medium">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-neutral-500">{detail}</p>}
    </div>
  )
}
