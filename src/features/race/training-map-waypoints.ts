import type { GpxWaypoint } from '@/lib/gpx-parser'
import { getDistanceFromStart, getNearestPointOnLine } from '@/lib/geo-utils'

export type TrainingWaypointKind = 'start' | 'finish' | 'water' | 'waypoint'

const WAYPOINT_STYLE: Record<TrainingWaypointKind, { markerLabel: string; color: string }> = {
  start: { markerLabel: 'S', color: '#16a34a' },
  finish: { markerLabel: 'F', color: '#dc2626' },
  water: { markerLabel: 'W', color: '#2563eb' },
  waypoint: { markerLabel: '•', color: '#f59e0b' },
}

export function trainingWaypointKind(name: string): TrainingWaypointKind {
  const normalized = name.trim().toLowerCase()
  if (/\bstart\b/.test(normalized)) return 'start'
  if (/\bfinish\b/.test(normalized)) return 'finish'
  if (/\bwater\b|\bhydration\b|\bspring\b|\bfountain\b/.test(normalized)) return 'water'
  return 'waypoint'
}

export function trainingWaypointStyle(name: string) {
  const kind = trainingWaypointKind(name)
  return { kind, ...WAYPOINT_STYLE[kind] }
}

export function trainingElevationWaypoints(
  waypoints: GpxWaypoint[],
  coordinates: [number, number][],
  totalDistance: number
): { id: string; mile: number; name: string; type: string }[] {
  if (coordinates.length < 2 || totalDistance <= 0) return []

  return waypoints.flatMap((waypoint, index) => {
    const kind = trainingWaypointKind(waypoint.name)
    let mile: number | null = null
    if (kind === 'start') mile = 0
    else if (kind === 'finish') mile = totalDistance
    else {
      const nearest = getNearestPointOnLine({ lat: waypoint.lat, lon: waypoint.lon }, coordinates)
      if (nearest) mile = getDistanceFromStart(coordinates, nearest.index, nearest)
    }
    if (mile == null || !Number.isFinite(mile)) return []
    return [{
      id: `${index}-${waypoint.name}`,
      mile: Math.max(0, Math.min(totalDistance, mile)),
      name: waypoint.name,
      type: kind === 'water' ? 'water_only' : kind === 'waypoint' ? 'landmark' : kind,
    }]
  })
}

export function trainingWaypointFeatureCollection(
  waypoints: GpxWaypoint[]
): GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; kind: TrainingWaypointKind; markerLabel: string; color: string }> {
  return {
    type: 'FeatureCollection',
    features: waypoints.map(waypoint => {
      const style = trainingWaypointStyle(waypoint.name)
      return {
        type: 'Feature',
        properties: { name: waypoint.name, ...style },
        geometry: { type: 'Point', coordinates: [waypoint.lon, waypoint.lat] },
      }
    }),
  }
}
