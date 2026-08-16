import React from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import type { TrainingRoute } from '@/types/database'
import type { GpxParseResult } from '@/lib/gpx-parser'
import {
  buildTrainingOverlapUpdates,
  computeTrainingOverlap,
  extractCoordinates,
  parseOverlapSegments,
  nameFromGpxFileName,
  nameFromRawGpx,
  uniqueCourseMiles,
  type OverlapSegment,
} from '@/lib/training-overlap'
import { getDistance } from '@/lib/geo-utils'

export type TrainingRouteRow = TrainingRoute & {
  overlapSegments: OverlapSegment[]
}

function toRow(raw: TrainingRoute): TrainingRouteRow {
  const overlapSegments = parseOverlapSegments(raw.overlap_segments)
  return {
    ...raw,
    // Older rows may have totals derived from candidate proximity hits that
    // were later rejected. Normalize from the accepted segments on every read.
    overlap_miles: Math.round(uniqueCourseMiles(overlapSegments) * 100) / 100,
    overlapSegments,
  }
}

const LIST_COLUMNS =
  'id,race_id,name,notes,distance_miles,elevation_gain_ft,elevation_loss_ft,geometry,start_lat,start_lon,finish_lat,finish_lon,overlap_miles,overlap_segments,strava_activity_inputs,strava_activity_results,sort_order,created_at,updated_at,created_by'

function courseCoordsFromGeometry(geometry: unknown): [number, number][] {
  return extractCoordinates(geometry)
}

/** Recompute overlap for all training routes on a race (e.g. after course GPX replace). */
export async function recomputeTrainingOverlapsForRace(
  raceId: string,
  newCourseGeometry: unknown
): Promise<void> {
  const { data, error: selectError } = await supabase
    .from('training_routes')
    .select('id, geometry')
    .eq('race_id', raceId)
  if (selectError) throw selectError

  const updates = buildTrainingOverlapUpdates(
    (data as Pick<TrainingRoute, 'id' | 'geometry'>[] | null) ?? [],
    newCourseGeometry
  )
  for (const update of updates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase.from('training_routes') as any)
      .update({
        overlap_miles: update.overlap_miles,
        overlap_segments: update.overlap_segments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id)
    if (updateError) throw updateError
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
      .select(LIST_COLUMNS)
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

  const createManualRoute = async (name: string, coords: [number, number][]) => {
    if (!canEdit) return null
    if (coords.length < 2) throw new Error('Add at least two points to create a training route')
    const courseCoords = courseCoordsFromGeometry(courseGeometry)
    const overlap = computeTrainingOverlap(coords, courseCoords)
    const distanceMiles = coords.slice(1).reduce(
      (total, point, index) => total + getDistance(coords[index][1], coords[index][0], point[1], point[0]),
      0
    )
    const maxOrder = routes.reduce((m, route) => Math.max(m, route.sort_order), -1)
    const row = {
      race_id: raceId,
      name: name.trim().slice(0, 120) || 'Training route',
      notes: null as string | null,
      distance_miles: distanceMiles,
      elevation_gain_ft: null,
      elevation_loss_ft: null,
      geometry: { type: 'LineString', coordinates: coords },
      elevation_samples: null,
      raw_gpx: null,
      start_lat: coords[0][1], start_lon: coords[0][0],
      finish_lat: coords[coords.length - 1][1], finish_lon: coords[coords.length - 1][0],
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
    patch: Partial<Pick<TrainingRoute, 'name' | 'notes' | 'sort_order' | 'strava_activity_inputs' | 'strava_activity_results'>>
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
    createManualRoute,
    updateRoute,
    deleteRoute,
    recomputeOverlaps,
  }
}
