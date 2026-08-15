import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, LoaderCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { STRAVA_RETURN_TO_STORAGE_KEY } from '@/features/auth/StravaCallback'
import { messageFromFunctionError } from '@/features/auth/strava-function-error'
import { parseGpx } from '@/lib/gpx-parser'
import { parseFinishTimeInput, raceDraftFromGpx, type GpxRaceDraft } from './race-history-gpx'
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

interface SavedHistoryRow {
  id: string
  raceName: string
  racedAt: string | null
  distanceMi: number
  elevationGainFt: number
  finishMinutes: number
  movingMinutes: number | null
  stravaActivityId: number | null
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

async function loadSavedHistory(userId: string): Promise<SavedHistoryRow[]> {
  const { data, error } = await supabase
    .from('runner_history')
    .select('id, race_name, raced_at, distance_mi, elevation_gain_ft, finish_minutes, moving_minutes, strava_activity_id')
    .eq('user_id', userId)
    .order('raced_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    raceName: row.race_name,
    racedAt: row.raced_at,
    distanceMi: Number(row.distance_mi),
    elevationGainFt: Number(row.elevation_gain_ft ?? 0),
    finishMinutes: Number(row.finish_minutes),
    movingMinutes: row.moving_minutes != null ? Number(row.moving_minutes) : null,
    stravaActivityId: row.strava_activity_id != null ? Number(row.strava_activity_id) : null,
  }))
}

export function StravaRaceHistoryPanel() {
  const { user } = useAuth()
  const [connectionStatus, setConnectionStatus] = useState<StravaConnectionStatus | null>(null)
  const [races, setRaces] = useState<StravaRaceSummary[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [savedHistory, setSavedHistory] = useState<SavedHistoryRow[]>([])
  const [gpxDraft, setGpxDraft] = useState<GpxRaceDraft | null>(null)
  const [gpxTimeInput, setGpxTimeInput] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
      const rows = await loadSavedHistory(user.id)
      if (cancelled) return
      setSavedHistory(rows)
      const ids = new Set(rows.map(row => row.stravaActivityId).filter((id): id is number => id != null && id > 0))
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
      if (user?.id) setSavedHistory(await loadSavedHistory(user.id))

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

      setSavedHistory(await loadSavedHistory(user.id))
      toast.success(selectedSet.size ? `Saved ${selectedSet.size} Strava race${selectedSet.size === 1 ? '' : 's'} for pace prediction` : 'Cleared Strava races from pace prediction')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save race selection'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const importedHistory = savedHistory.filter(row => row.stravaActivityId == null || !(row.stravaActivityId > 0))

  const importGpx = async (file: File) => {
    setError(null)
    try {
      if (!file.name.toLowerCase().endsWith('.gpx')) throw new Error('Please choose a GPX file.')
      const parsed = parseGpx(await file.text())
      const draft = raceDraftFromGpx(parsed, file.name)
      if (!(draft.distanceMi > 0)) throw new Error('That GPX has no usable distance.')
      setGpxDraft(draft)
      setGpxTimeInput(draft.finishMinutes != null ? formatDuration(draft.finishMinutes) : '')
    } catch (caught) {
      setGpxDraft(null)
      setError(caught instanceof Error ? caught.message : 'Unable to read that GPX file')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const saveGpxDraft = async () => {
    if (!user?.id || !gpxDraft) return
    const finishMinutes = gpxDraft.finishMinutes ?? parseFinishTimeInput(gpxTimeInput)
    if (!finishMinutes) {
      setError('Enter a finish time as HH:MM if the GPX has no timestamps.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const movingMinutes = gpxDraft.movingMinutes && gpxDraft.movingMinutes > 0 ? gpxDraft.movingMinutes : finishMinutes
      const { error: insertError } = await supabase.from('runner_history').insert({
        user_id: user.id,
        race_name: gpxDraft.raceName,
        raced_at: gpxDraft.racedAt,
        distance_mi: gpxDraft.distanceMi,
        elevation_gain_ft: gpxDraft.elevationGainFt,
        finish_minutes: finishMinutes,
        moving_minutes: movingMinutes,
      })
      if (insertError) throw insertError
      setSavedHistory(await loadSavedHistory(user.id))
      setGpxDraft(null)
      setGpxTimeInput('')
      toast.success('Imported GPX finish for pace prediction')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save imported GPX'
      setError(message)
      toast.error(message)
    } finally {
      setImporting(false)
    }
  }

  const removeHistory = async (id: string) => {
    if (!user?.id) return
    const { error: deleteError } = await supabase.from('runner_history').delete().eq('id', id)
    if (deleteError) {
      toast.error(deleteError.message)
      return
    }
    setSavedHistory(prev => prev.filter(row => row.id !== id))
  }

  return (
    <div id="race-history" className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
        <Activity className="w-5 h-5 text-violet-400" /> Race history
      </h2>
      <p className="text-xs text-neutral-500 mb-4">
        Selected finishes calibrate an independent predicted range. Shorter races than the event you are planning count less — a 50K or 50-miler will not outweigh a 100-mile result. They do not change Plan A unless you apply that prediction on the Pace tab.
      </p>
      <p className="text-xs text-neutral-500 mb-4">
        <strong className="text-neutral-300">Find races</strong> lists only Strava <strong className="text-neutral-300">Run, Trail Run, and Virtual Run</strong> activities that you marked as a <strong className="text-neutral-300">Race</strong> in Strava (the Race workout type), from about the last three years. It does not search titles and does not include untagged runs, rides, or workouts. If a race is missing, mark it as a Race on Strava and find again, or import a GPX.
      </p>

      <p className="text-sm text-neutral-300 mb-3">
        {savedHistory.length > 0
          ? `${savedHistory.length} finish${savedHistory.length === 1 ? '' : 'es'} currently used for prediction.`
          : 'No finishes selected yet.'}
        {' '}
        {connectionStatus?.connected
          ? <>Connected as <span className="font-medium text-emerald-300">{connectionStatus.athleteName}</span>.</>
          : connectionStatus ? 'Connect Strava to import tagged races, or add a GPX below.' : 'Checking Strava connection…'}
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-neutral-700 bg-neutral-950 hover:bg-neutral-800 px-3 py-2 text-sm font-semibold text-white"
        >
          Import GPX
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) void importGpx(file)
          }}
        />
      </div>

      {races && rows.length === 0 && (
        <p className="text-sm text-neutral-500">No Strava running activities marked as a Race were found in the last three years. Open the activity in Strava, set type to Race, then find again — or import a GPX.</p>
      )}

      {truncated && (
        <p className="mb-3 text-xs text-amber-300">Stopped after recent activity pages. Older tagged races may be missing.</p>
      )}

      {rows.length > 0 && (
        <>
          <p className="mb-2 text-[11px] text-neutral-500">
            These are the activities Strava has tagged as Race. Short road races stay unchecked by default so they do not pull an ultra estimate too fast.
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

      {gpxDraft && (
        <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
          <div className="text-sm text-white">{gpxDraft.raceName}</div>
          <div className="text-[11px] text-neutral-500 mt-1">
            {gpxDraft.racedAt ?? 'Undated'} · {gpxDraft.distanceMi.toFixed(1)} mi · {gpxDraft.elevationGainFt.toLocaleString()} ft
            {gpxDraft.finishMinutes != null ? ` · ${formatDuration(gpxDraft.finishMinutes)} elapsed` : ''}
          </div>
          {gpxDraft.finishMinutes == null && (
            <label className="block mt-3">
              <span className="text-[11px] text-neutral-500">Finish time (HH:MM)</span>
              <input
                value={gpxTimeInput}
                onChange={event => setGpxTimeInput(event.target.value)}
                placeholder="e.g. 18:30"
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-2 text-sm text-white"
              />
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void saveGpxDraft()}
              disabled={importing}
              className="rounded bg-violet-600 hover:bg-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {importing ? 'Saving…' : 'Save imported finish'}
            </button>
            <button type="button" onClick={() => setGpxDraft(null)} className="text-sm text-neutral-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {importedHistory.length > 0 && (
        <ul className="mb-4 space-y-2">
          {importedHistory.map(row => (
            <li key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-white">{row.raceName}</span>
                <span className="block text-[11px] text-neutral-500">
                  {row.racedAt ?? 'Undated'} · {row.distanceMi.toFixed(1)} mi · {row.elevationGainFt.toLocaleString()} ft · {formatDuration(row.movingMinutes ?? row.finishMinutes)}
                </span>
              </span>
              <button type="button" onClick={() => void removeHistory(row.id)} className="text-xs text-neutral-500 hover:text-red-400 shrink-0">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!races && savedHistory.some(row => row.stravaActivityId != null && row.stravaActivityId > 0) && (
        <p className="text-xs text-neutral-500">
          Find races to review or change the Strava selection. The Pace tab uses all currently saved finishes.
        </p>
      )}
    </div>
  )
}
