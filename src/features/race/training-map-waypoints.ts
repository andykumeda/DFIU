import type { GpxWaypoint } from '@/lib/gpx-parser'

export function trainingWaypointFeatureCollection(
  waypoints: GpxWaypoint[]
): GeoJSON.FeatureCollection<GeoJSON.Point, { name: string }> {
  return {
    type: 'FeatureCollection',
    features: waypoints.map(waypoint => ({
      type: 'Feature',
      properties: { name: waypoint.name },
      geometry: { type: 'Point', coordinates: [waypoint.lon, waypoint.lat] },
    })),
  }
}
