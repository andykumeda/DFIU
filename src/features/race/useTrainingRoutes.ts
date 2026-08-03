import React from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import type { TrainingRoute } from '@/types/database'
import type { GpxParseResult } from '@/lib/gpx-parser'
import {
  computeTrainingOverlap,
  extractCoordinates,
  parseOverlapSegments,
  nameFromGpxFileName,
  nameFromRawGpx,
  type OverlapSegment,
} from '@/lib/training-overlap'

export type TrainingRouteRow = TrainingRoute & {
  overlapSegments: OverlapSegment[]
}

function toRow(raw: TrainingRoute): TrainingRouteRow {
  return {
    ...raw,
    overlapSegments: parseOverlapSegments(raw.overlap_segments),
  }
}

function courseCoordsFromGeometry(geometry: unknown): [number, number][] {
  return extractCoordinates(geometry)
}

/** Recompute overlap for all training routes on a race (e.g. after course GPX replace). */
export async function recomputeTrainingOverlapsForRace(
  raceId: string,
  newCourseGeometry: unknown
): Promise<void> {
  const courseCoords = courseCoordsFromGeometry(newCourseGeometry)
  if (courseCoords.length < 2) return

  const { data } = await supabase
    .from('training_routes')
    .select('*')
    .eq('race_id', raceId)

  const rows = (data as TrainingRoute[] | null) ?? []
  for (const row of rows) {
    const trainingCoords = extractCoordinates(row.geometry)
    const overlap = computeTrainingOverlap(trainingCoords, courseCoords)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('training_routes') as any)
      .update({
        overlap_miles: overlap.overlapMiles,
        overlap_segments: overlap.segments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
  }
}

export function useTrainingRoutes(raceId: string, courseGeometry: unknown) {
  const { user } = useAuth()
  const { canEditRaceSettings } = usePermission(raceId)
  const canEdit = canEditRaceSettings
  const [routes, setRoutes] = React.useState<TrainingRouteRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('training_routes')
      .select('*')
      .eq('race_id', raceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (!error && data) {
      setRoutes((data as TrainingRoute[]).map(toRow))
    }
    setLoading(false)
  }, [raceId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  React.useEffect(() => {
    const channel = supabase
      .channel(`training_routes:${raceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'training_routes', filter: `race_id=eq.${raceId}` },
        () => {
          void reload()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [raceId, reload])

  const createFromGpx = async (result: GpxParseResult, rawGpx: string, fileName?: string) => {
    if (!canEdit) return null
    const coords = result.coordinates
    if (coords.length < 2) throw new Error('GPX has no usable track')

    const courseCoords = courseCoordsFromGeometry(courseGeometry)
    const overlap = computeTrainingOverlap(coords, courseCoords)
    const start = coords[0]
    const finish = coords[coords.length - 1]
    const maxOrder = routes.reduce((m, r) => Math.max(m, r.sort_order), -1)
    const displayName = (
      (fileName ? nameFromGpxFileName(fileName) : '') ||
      result.name?.trim() ||
      nameFromRawGpx(rawGpx) ||
      'Training route'
    ).slice(0, 120)

    const row = {
      race_id: raceId,
      name: displayName,
      notes: null as string | null,
      distance_miles: result.stats.totalDistanceMiles,
      elevation_gain_ft: result.stats.totalElevationGainFt,
      elevation_loss_ft: result.stats.totalElevationLossFt,
      geometry: { type: 'LineString', coordinates: coords },
      elevation_samples: result.elevationProfile,
      raw_gpx: rawGpx,
      start_lat: start[1],
      start_lon: start[0],
      finish_lat: finish[1],
      finish_lon: finish[0],
      overlap_miles: overlap.overlapMiles,
      overlap_segments: overlap.segments,
      sort_order: maxOrder + 1,
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('training_routes') as any).insert(row).select('*').single()
    if (error) throw error
    const created = toRow(data as TrainingRoute)
    setRoutes(prev => [...prev, created])
    return created
  }

  const updateRoute = async (
    id: string,
    patch: Partial<Pick<TrainingRoute, 'name' | 'notes' | 'sort_order'>>
  ) => {
    if (!canEdit) return
    const payload = { ...patch, updated_at: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('training_routes') as any)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    const next = toRow(data as TrainingRoute)
    setRoutes(prev => prev.map(r => (r.id === id ? next : r)))
  }

  const deleteRoute = async (id: string) => {
    if (!canEdit) return
    const { error } = await supabase.from('training_routes').delete().eq('id', id)
    if (error) throw error
    setRoutes(prev => prev.filter(r => r.id !== id))
  }

  const recomputeOverlaps = async (newCourseGeometry: unknown) => {
    if (!canEdit) return
    await recomputeTrainingOverlapsForRace(raceId, newCourseGeometry)
    await reload()
  }

  return {
    routes,
    loading,
    canEdit,
    reload,
    createFromGpx,
    updateRoute,
    deleteRoute,
    recomputeOverlaps,
  }
}
