import { getDistanceFromStart, getNearestPointOnLine } from '@/lib/geo-utils'

export interface TrainingHoverMiles {
  trainingMile: number
  raceMile: number | null
  lon: number
  lat: number
}

export function raceMileForTrainingMile(
  trainingMile: number,
  segments: {
    trainingStartMi: number
    trainingEndMi: number
    courseStartMi?: number
    courseEndMi?: number
  }[] | undefined
): number | null {
  if (!segments?.length) return null
  for (const segment of segments) {
    if (segment.courseStartMi == null || segment.courseEndMi == null) continue
    const lo = Math.min(segment.trainingStartMi, segment.trainingEndMi)
    const hi = Math.max(segment.trainingStartMi, segment.trainingEndMi)
    if (trainingMile < lo - 0.02 || trainingMile > hi + 0.02) continue
    const span = segment.trainingEndMi - segment.trainingStartMi
    if (Math.abs(span) < 1e-6) return segment.courseStartMi
    const t = (trainingMile - segment.trainingStartMi) / span
    return segment.courseStartMi + t * (segment.courseEndMi - segment.courseStartMi)
  }
  return null
}

export function formatTrainingMapHover(raceMile: number | null, trainingMile: number): string {
  const training = `Training: Mile ${trainingMile.toFixed(1)}`
  if (raceMile == null || !Number.isFinite(raceMile)) return training
  return `Race: Mile ${raceMile.toFixed(1)} | ${training}`
}

export function hoverMilesAtPoint(
  lon: number,
  lat: number,
  training: [number, number][],
  overlapSegments?: {
    trainingStartMi: number
    trainingEndMi: number
    courseStartMi?: number
    courseEndMi?: number
  }[]
): TrainingHoverMiles | null {
  if (training.length < 2) return null
  const snapped = getNearestPointOnLine({ lat, lon }, training)
  if (!snapped) return null
  const trainingMile = getDistanceFromStart(training, snapped.index, {
    lat: snapped.lat,
    lon: snapped.lon,
  })
  return {
    trainingMile,
    raceMile: raceMileForTrainingMile(trainingMile, overlapSegments),
    lon: snapped.lon,
    lat: snapped.lat,
  }
}
