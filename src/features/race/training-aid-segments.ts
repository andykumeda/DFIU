import type { Waypoint } from '@/types/database'
import { mergeContinuousOverlapSegments, type OverlapSegment } from '@/lib/training-overlap'

export type OfficialAidStation = Pick<Waypoint, 'name' | 'mile' | 'type'>

export interface AidStationOverlapSegment extends OverlapSegment {
  startAidStationName?: string
  endAidStationName?: string
}

const MIN_SECTION_MI = 0.05
const ENDPOINT_MATCH_MI = 0.15

function officialAidStations(waypoints: OfficialAidStation[]): OfficialAidStation[] {
  return waypoints
    .filter(waypoint => waypoint.type === 'aid_station' && Number.isFinite(waypoint.mile))
    .sort((a, b) => a.mile - b.mile)
}

function aidStationNameAtMile(stations: OfficialAidStation[], mile: number): string | undefined {
  let closest: OfficialAidStation | undefined
  let closestDistance = Infinity
  for (const station of stations) {
    const distance = Math.abs(station.mile - mile)
    if (distance < closestDistance) {
      closest = station
      closestDistance = distance
    }
  }
  return closestDistance <= ENDPOINT_MATCH_MI ? closest?.name : undefined
}

/**
 * Turn each continuous course overlap into official aid-to-aid sections.
 * Course-mile boundaries are projected onto training miles so map highlighting,
 * Plan A timing, and activity-stream comparisons all use the same slices.
 */
export function splitOverlapAtAidStations(
  segments: OverlapSegment[],
  waypoints: OfficialAidStation[]
): AidStationOverlapSegment[] {
  const grouped = mergeContinuousOverlapSegments(segments)
  const stations = officialAidStations(waypoints)
  if (stations.length === 0) return grouped

  return grouped.flatMap(segment => {
    const courseSpan = segment.courseEndMi - segment.courseStartMi
    if (Math.abs(courseSpan) < MIN_SECTION_MI) return [segment]

    const lowerCourseMile = Math.min(segment.courseStartMi, segment.courseEndMi)
    const upperCourseMile = Math.max(segment.courseStartMi, segment.courseEndMi)
    const internalStations = stations
      .filter(station =>
        station.mile > lowerCourseMile + ENDPOINT_MATCH_MI &&
        station.mile < upperCourseMile - ENDPOINT_MATCH_MI
      )
      .sort((a, b) => courseSpan > 0 ? a.mile - b.mile : b.mile - a.mile)

    const boundaries = [
      { mile: segment.courseStartMi, name: aidStationNameAtMile(stations, segment.courseStartMi) },
      ...internalStations.map(station => ({ mile: station.mile, name: station.name })),
      { mile: segment.courseEndMi, name: aidStationNameAtMile(stations, segment.courseEndMi) },
    ]

    return boundaries.slice(0, -1).map((boundary, index) => {
      const next = boundaries[index + 1]
      const startFraction = (boundary.mile - segment.courseStartMi) / courseSpan
      const endFraction = (next.mile - segment.courseStartMi) / courseSpan
      const trainingSpan = segment.trainingEndMi - segment.trainingStartMi
      return {
        courseStartMi: boundary.mile,
        courseEndMi: next.mile,
        trainingStartMi: segment.trainingStartMi + trainingSpan * startFraction,
        trainingEndMi: segment.trainingStartMi + trainingSpan * endFraction,
        startAidStationName: boundary.name,
        endAidStationName: next.name,
      }
    })
  })
}

export function aidStationSectionLabel(
  segment: Pick<AidStationOverlapSegment, 'startAidStationName' | 'endAidStationName'>
): string | null {
  return segment.startAidStationName && segment.endAidStationName
    ? `${segment.startAidStationName} → ${segment.endAidStationName}`
    : null
}
