import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import type { Race, RunnerLocation } from '@/types/database'

const STALE_LOCATION_MS = 10 * 60 * 1000

export function useLatestRunnerLocation(raceId: string) {
  const [location, setLocation] = useState<RunnerLocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('runner_locations')
        .select('*')
        .eq('race_id', raceId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        setLocation((data as RunnerLocation | null) ?? null)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [raceId])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel(`runner_locations:${raceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'runner_locations', filter: `race_id=eq.${raceId}` },
        payload => {
          const next = payload.new as RunnerLocation
          setLocation(prev => !prev || next.recorded_at >= prev.recorded_at ? next : prev)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [raceId])

  const isFresh = location ? now - new Date(location.recorded_at).getTime() <= STALE_LOCATION_MS : false
  return { location, loading, isFresh }
}

export function useRunnerLocationUploader(raceId: string, race: Race | null) {
  const { user } = useAuth()
  const { isRunner } = usePermission(raceId)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'active' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState<string>('Waiting for race window')
  const [lastUploadAt, setLastUploadAt] = useState<Date | null>(null)

  const raceWindowActive = isRaceWindowActive(race)

  const uploadCurrentPosition = useCallback(() => {
    if (!user || !isRunner || !raceWindowActive) return
    if (!('geolocation' in navigator)) {
      setUploadStatus('error')
      setUploadMessage('Location is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { error } = await supabase.from('runner_locations').insert({
          race_id: raceId,
          runner_user_id: user.id,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          speed_mps: pos.coords.speed,
          heading_deg: pos.coords.heading,
          recorded_at: new Date(pos.timestamp).toISOString(),
        })

        if (error) {
          setUploadStatus('error')
          setUploadMessage(error.message)
          return
        }

        setUploadStatus('active')
        setUploadMessage('Sharing location')
        setLastUploadAt(new Date())
      },
      err => {
        setUploadStatus('error')
        setUploadMessage(err.message)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 20_000 }
    )
  }, [isRunner, raceId, raceWindowActive, user])

  useEffect(() => {
    if (!user || !isRunner) {
      return
    }
    if (!raceWindowActive) {
      return
    }

    const initial = setTimeout(uploadCurrentPosition, 0)
    const interval = setInterval(uploadCurrentPosition, 60_000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [isRunner, raceWindowActive, uploadCurrentPosition, user])

  const inactiveMessage = !user || !isRunner
    ? 'Runner role required'
    : 'Location sharing starts during the race window'
  const status = user && isRunner && raceWindowActive ? uploadStatus : 'inactive'
  const message = user && isRunner && raceWindowActive ? uploadMessage : inactiveMessage

  return { status, message, lastUploadAt, raceWindowActive, uploadCurrentPosition }
}

function isRaceWindowActive(race: Race | null): boolean {
  if (!race?.start_datetime) return false
  if (race.is_official) return false
  const start = new Date(race.start_datetime).getTime()
  if (!isFinite(start)) return false
  const cutoffMinutes = parseCutoffMinutes(race.overall_cutoff) ?? 48 * 60
  const end = start + cutoffMinutes * 60_000
  const now = Date.now()
  return now >= start && now <= end
}

function parseCutoffMinutes(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/^(\d+):([0-5]\d)$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}
