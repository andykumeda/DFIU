import { useMemo, useState } from 'react'
import { Activity, BarChart3, Link2, LoaderCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { STRAVA_RETURN_TO_STORAGE_KEY } from '@/features/auth/StravaCallback'
import type { Race } from '@/types/database'
import type { PacePlanResult } from './pace-utils'
import type { TrainingRouteRow } from './useTrainingRoutes'
import {
  buildTrainingPlanSummary,
  formatDurationWords,
  getTrainingAnalysisDelta,
} from './training-analysis'

interface StravaActivity {
  id: number
  name: string
  elapsedSeconds: number
  movingSeconds: number
  distanceMiles: number | null
  startDate: string | null
}

interface TrainingAnalysisPanelProps {
  routes: TrainingRouteRow[]
  planA: PacePlanResult | null
  planAGoalMinutes: number
  race: Race
  clock24h: boolean
}

async function messageFromFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: unknown }
        if (typeof body.error === 'string') return body.error
      } catch {
        // Fall back to the generic function error below.
      }
    }
  }
  return error instanceof Error ? error.message : 'Unable to load Strava activity'
}

export function TrainingAnalysisPanel({
  routes,
  planA,
  planAGoalMinutes,
  race,
  clock24h,
}: TrainingAnalysisPanelProps) {
  const [routeId, setRouteId] = useState(routes[0]?.id ?? '')
  const [activityInput, setActivityInput] = useState('')
  const [activity, setActivity] = useState<StravaActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedRoute = routes.find(route => route.id === routeId) ?? routes[0] ?? null
  const summary = useMemo(
    () =>
      selectedRoute
        ? buildTrainingPlanSummary(selectedRoute.overlapSegments, planA, race, clock24h)
        : null,
    [selectedRoute, planA, race, clock24h]
  )
  const comparison =
    activity && summary?.raceDurationMinutes != null
      ? getTrainingAnalysisDelta(activity.elapsedSeconds / 60, summary.raceDurationMinutes)
      : null

  const analyzeActivity = async () => {
    if (!activityInput.trim()) {
      setError('Paste a Strava activity link or enter its numeric activity ID.')
      return
    }
    if (!summary?.raceDurationMinutes) {
      setError('Generate Plan A before comparing a training activity.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('strava-activity', {
        body: { activity: activityInput.trim() },
      })
      if (invokeError) throw invokeError
      if (!data?.elapsedSeconds) throw new Error(data?.error || 'Strava activity has no elapsed time')
      setActivity(data as StravaActivity)
    } catch (caught) {
      setActivity(null)
      setError(await messageFromFunctionError(caught))
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
      setError(await messageFromFunctionError(caught))
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
            Compare a completed Strava run with the Plan A goal for its matching race segment.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Training route</span>
            <select
              value={selectedRoute?.id ?? ''}
              onChange={event => {
                setRouteId(event.target.value)
                setActivity(null)
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
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Strava run</span>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" aria-hidden />
              <input
                value={activityInput}
                onChange={event => setActivityInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void analyzeActivity()
                }}
                placeholder="Paste a Strava activity link or ID"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-orange-400"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={() => void analyzeActivity()}
            disabled={loading || !summary?.raceDurationMinutes}
            className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium"
          >
            {loading && <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden />}
            Analyze run
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <p>First time here? Connect Strava once so DFIU can read the activity you choose.</p>
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
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <SummaryMetric
              label="Race segment"
              value={`${summary.raceMilesLabel} mi`}
              detail={`Plan A ${summary.raceDurationLabel ?? 'not generated'}`}
            />
            <SummaryMetric
              label="Training portions"
              value={`${summary.trainingMilesLabel} mi`}
              detail={`${summary.trainingMilesTotal.toFixed(1)} mi total on route`}
            />
            <SummaryMetric
              label="Plan A goal"
              value={planAGoalMinutes > 0 ? formatDurationWords(planAGoalMinutes) : 'Not generated'}
              detail="overall race goal"
            />
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

        {activity && comparison && summary && (
          <div className="mt-5 rounded-lg border border-neutral-700 bg-neutral-950/70 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{activity.name}</p>
                <p className="text-xs text-neutral-500 mt-1">Strava elapsed time is used so stops are included.</p>
              </div>
              <p
                className={
                  comparison.tone === 'faster'
                    ? 'text-sm font-medium text-emerald-300'
                    : comparison.tone === 'slower'
                      ? 'text-sm font-medium text-orange-300'
                      : 'text-sm font-medium text-neutral-200'
                }
              >
                {comparison.label}
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <SummaryMetric label="Training elapsed" value={formatDurationWords(activity.elapsedSeconds / 60)} />
              <SummaryMetric label="Plan A segment" value={summary.raceDurationLabel ?? '—'} />
              <SummaryMetric label="Delta" value={comparison.label} />
            </dl>
          </div>
        )}
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
