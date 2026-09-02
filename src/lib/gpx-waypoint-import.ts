import { getAllVisitsOnLine, getDistanceFromStart, getNearestPointOnLine } from './geo-utils'
import type { GpxParseResult } from './gpx-parser'

export type ImportedWaypointRow = {
  course_id: string
  name: string
  type: string
  lat: number
  lon: number
  mile: number
  has_drop_bag: boolean
  crew_allowed: boolean
  pacer_allowed: boolean
  order_index: number
}

/** Convert GPX waypoints into course waypoint rows, including route endpoints. */
export function buildImportedWaypointRows(
  result: Pick<GpxParseResult, 'waypoints' | 'coordinates' | 'stats'>,
  courseId: string,
  includeEndpoints = true,
): ImportedWaypointRow[] {
  if (result.coordinates.length === 0) return []

  const totalDist = result.stats.totalDistanceMiles
  const rows: Omit<ImportedWaypointRow, 'order_index'>[] = []
  const addRow = (row: Omit<ImportedWaypointRow, 'order_index'>) => rows.push(row)

  result.waypoints.forEach((wpt, index) => {
    const name = wpt.name || `Aid Station ${index + 1}`
    const lower = name.toLowerCase()

    if (lower.includes('start & finish') || lower.includes('start/finish')) {
      const first = result.coordinates[0]
      const last = result.coordinates[result.coordinates.length - 1]
      addRow({ course_id: courseId, name: 'Start', type: 'start', lat: first[1], lon: first[0], mile: 0, has_drop_bag: false, crew_allowed: false, pacer_allowed: false })
      addRow({ course_id: courseId, name: 'Finish', type: 'finish', lat: last[1], lon: last[0], mile: Math.round(totalDist * 100) / 100, has_drop_bag: false, crew_allowed: false, pacer_allowed: false })
      return
    }

    const visits = getAllVisitsOnLine({ lat: wpt.lat, lon: wpt.lon }, result.coordinates)
    let type = 'aid_station'
    if (lower === 'start') type = 'start'
    if (lower === 'finish') type = 'finish'

    if (visits.length >= 2) {
      visits.forEach(visit => addRow({
        course_id: courseId,
        name: `${name} (mi ${Math.round(visit.mile)})`,
        type,
        lat: visit.lat,
        lon: visit.lon,
        mile: Math.round(visit.mile * 100) / 100,
        has_drop_bag: false,
        crew_allowed: false,
        pacer_allowed: false,
      }))
      return
    }

    const nearest = getNearestPointOnLine({ lat: wpt.lat, lon: wpt.lon }, result.coordinates)
    let mile = 0
    let lat = wpt.lat
    let lon = wpt.lon
    if (visits.length === 1) {
      mile = visits[0].mile
      lat = visits[0].lat
      lon = visits[0].lon
    } else if (nearest && nearest.distance < 2) {
      mile = getDistanceFromStart(result.coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })
      lat = nearest.lat
      lon = nearest.lon
    }

    addRow({ course_id: courseId, name, type, lat, lon, mile: Math.round(mile * 100) / 100, has_drop_bag: false, crew_allowed: false, pacer_allowed: false })
  })

  if (includeEndpoints && !rows.some(row => row.type === 'start')) {
    const first = result.coordinates[0]
    addRow({ course_id: courseId, name: 'Start', type: 'start', lat: first[1], lon: first[0], mile: 0, has_drop_bag: false, crew_allowed: false, pacer_allowed: false })
  }
  if (includeEndpoints && !rows.some(row => row.type === 'finish')) {
    const last = result.coordinates[result.coordinates.length - 1]
    addRow({ course_id: courseId, name: 'Finish', type: 'finish', lat: last[1], lon: last[0], mile: Math.round(totalDist * 100) / 100, has_drop_bag: false, crew_allowed: false, pacer_allowed: false })
  }

  const uniqueRows = rows.filter((row, index, allRows) => allRows.findIndex(candidate =>
    candidate.type === row.type && candidate.name === row.name && candidate.mile === row.mile
  ) === index)

  return uniqueRows
    .sort((a, b) => a.mile - b.mile)
    .map((row, index) => ({ ...row, order_index: index + 1 }))
}
