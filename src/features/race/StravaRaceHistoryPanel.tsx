import { useEffect, useMemo, useState } from 'react'
import { Activity, LoaderCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { STRAVA_RETURN_TO_STORAGE_KEY } from '@/features/auth/StravaCallback'
import { messageFromFunctionError } from '@/features/auth/strava-function-error'
import {
  equivalentPaceForRace,
  shouldDefaultSelectStravaRace,
  stravaRaceToHistoryDraft,
  type StravaRaceSummary,
} from './strava-races'

interface StravaConnectionStatus {
  connected: boolean
  athleteName?: string
}

function formatPace(minutesPerMile: number) {
  if (!Number.isFinite(minutesPerMile) || minutesPerMile <= 0) return '—'
  const minutes = Math.floor(minutesPerMile)
  const seconds = Math.round((minutesPerMile - minutes) * 60)
  if (seconds === 60) return `${minutes + 1}:00`
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

function sportLabel(sportType: string) {
  if (sportType === 'TrailRun') return 'Trail'
  if (sportType === 'VirtualRun') return 'Virtual'
  return 'Road'
}

export function StravaRaceHistoryPanel() {
  const { user } = useAuth()
  const [connectionStatus, setConnectionStatus] = useState<StravaConnectionStatus | null>(null)
  const [races, setRaces] = useState<StravaRaceSummary[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [savedCount, setSavedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('runner_history')
        .select('strava_activity_id')
        .eq('user_id', user.id)
      if (cancelled || !data) return
      const ids = new Set(
        data
          .map(row => Number(row.strava_activity_id))
          .filter(id => Number.isFinite(id) && id > 0)
      )
      setSavedCount(ids.size)
      setSelectedIds(prev => (prev.size > 0 ? prev : ids))
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const rows = useMemo(() => {
    if (!races) return []
    return races
      .map(race => {
        const draft = stravaRaceToHistoryDraft(race)
        if (!draft) return null
        return { race, draft, equivalentPace: equivalentPaceForRace(draft) }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
  }, [races])

  const findRaces = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('strava-activity', {
        body: { action: 'list-races' },
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      const { data: savedRows } = user?.id
        ? await supabase.from('runner_history').select('strava_activity_id').eq('user_id', user.id)
        : { data: [] as { strava_activity_id: number | null }[] }
      const currentSaved = new Set(
        (savedRows ?? [])
          .map(row => Number(row.strava_activity_id))
          .filter(id => Number.isFinite(id) && id > 0)
      )
      setSavedCount(currentSaved.size)

      const listed = Array.isArray(data?.races) ? data.races as StravaRaceSummary[] : []
      setRaces(listed)
      setTruncated(Boolean(data?.truncated))
      const nextSelected = new Set<number>()
      for (const race of listed) {
        if (currentSaved.has(race.id) || (currentSaved.size === 0 && shouldDefaultSelectStravaRace(race))) {
          nextSelected.add(race.id)
        }
      }
      setSelectedIds(nextSelected)
    } catch (caught) {
      setError(await messageFromFunctionError(caught, 'Unable to load Strava races'))
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
      sessionStorage.setItem(STRAVA_RETURN_TO_STORAGE_KEY, '/settings#race-history')
      window.location.assign(data.url)
    } catch (caught) {
      setError(await messageFromFunctionError(caught, 'Unable to start Strava connection'))
      setConnecting(false)
    }
  }

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveSelection = async () => {
    if (!user?.id || !races) return
    setSaving(true)
    setError(null)
    try {
      const { data: existing, error: loadError } = await supabase
        .from('runner_history')
        .select('id, strava_activity_id')
        .eq('user_id', user.id)
      if (loadError) throw loadError

      const existingByStrava = new Map<number, string>()
      for (const row of existing ?? []) {
        const id = Number(row.strava_activity_id)
        if (Number.isFinite(id) && id > 0) existingByStrava.set(id, row.id)
      }

      const listedIds = new Set(races.map(race => race.id))
      const selectedDrafts = rows.filter(row => selectedIds.has(row.race.id)).map(row => row.draft)
      const selectedSet = new Set(selectedDrafts.map(draft => draft.stravaActivityId))

      const toDelete = [...existingByStrava.entries()]
        .filter(([stravaId]) => listedIds.has(stravaId) && !selectedSet.has(stravaId))
        .map(([, rowId]) => rowId)
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase.from('runner_history').delete().in('id', toDelete)
        if (deleteError) throw deleteError
      }

      for (const draft of selectedDrafts) {
        const payload = {
          user_id: user.id,
          race_name: draft.raceName,
          raced_at: draft.racedAt,
          distance_mi: draft.distanceMi,
          elevation_gain_ft: draft.elevationGainFt,
          finish_minutes: draft.finishMinutes,
          moving_minutes: draft.movingMinutes,
          strava_activity_id: draft.stravaActivityId,
          updated_at: new Date().toISOString(),
        }
        const existingId = existingByStrava.get(draft.stravaActivityId)
        if (existingId) {
          const { error: updateError } = await supabase.from('runner_history').update(payload).eq('id', existingId)
          if (updateError) throw updateError
        } else {
          const { error: insertError } = await supabase.from('runner_history').insert(payload)
          if (insertError) throw insertError
        }
      }

      const remainingUnlisted = [...existingByStrava.keys()].filter(id => !listedIds.has(id))
      const nextSaved = new Set([...selectedSet, ...remainingUnlisted])
      setSavedCount(nextSaved.size)
      toast.success(nextSaved.size ? `Saved ${nextSaved.size} race${nextSaved.size === 1 ? '' : 's'} for pace prediction` : 'Cleared Strava races from pace prediction')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save race selection'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="race-history" className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
        <Activity className="w-5 h-5 text-violet-400" /> Race history (Strava)
      </h2>
      <p className="text-xs text-neutral-500 mb-4">
        Tagged Strava races calibrate an independent predicted finish range. They do not change Plan A unless you apply that prediction on the Pace tab.
      </p>

      <p className="text-sm text-neutral-300 mb-3">
        {connectionStatus?.connected
          ? <>Connected as <span className="font-medium text-emerald-300">{connectionStatus.athleteName}</span>. {savedCount > 0 ? `${savedCount} race${savedCount === 1 ? '' : 's'} currently used for prediction.` : 'No races selected yet.'}</>
          : connectionStatus ? 'Connect Strava to find races tagged on your account.' : 'Checking Strava connection…'}
      </p>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        {!connectionStatus?.connected && (
          <button
            type="button"
            onClick={() => void connectStrava()}
            disabled={connecting}
            className="rounded bg-orange-600 hover:bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {connecting ? 'Connecting…' : 'Connect Strava'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void findRaces()}
          disabled={loading || !connectionStatus?.connected}
          className="rounded bg-violet-600 hover:bg-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading && <LoaderCircle className="w-4 h-4 animate-spin" />}
          {loading ? 'Finding races…' : 'Find races'}
        </button>
      </div>

      {races && rows.length === 0 && (
        <p className="text-sm text-neutral-500">No tagged running races found in the last three years. In Strava, mark an activity as a Race to include it here.</p>
      )}

      {truncated && (
        <p className="mb-3 text-xs text-amber-300">Stopped after recent activity pages. Older tagged races may be missing.</p>
      )}

      {rows.length > 0 && (
        <>
          <p className="mb-2 text-[11px] text-neutral-600">
            Short road races stay unchecked by default — they can make an ultra prediction look too fast.
          </p>
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {rows.map(({ race, draft, equivalentPace }) => (
              <li key={race.id}>
                <label className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(race.id)}
                    onChange={() => toggle(race.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-white">{draft.raceName}</span>
                    <span className="block text-[11px] text-neutral-500">
                      {draft.racedAt ?? 'Undated'} · {draft.distanceMi.toFixed(1)} mi · {draft.elevationGainFt.toLocaleString()} ft · moving {formatDuration(draft.movingMinutes)} · {formatPace(equivalentPace)}/mi equiv. · {sportLabel(race.sportType)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void saveSelection()}
            disabled={saving}
            className="mt-4 rounded bg-violet-600 hover:bg-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save selection'}
          </button>
        </>
      )}

      {!races && savedCount > 0 && (
        <p className="text-xs text-neutral-500">
          Find races to review or change the selection. The Pace tab uses the currently saved finishes.
        </p>
      )}
    </div>
  )
}
