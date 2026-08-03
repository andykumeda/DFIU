import { getDistance, getDistanceFromStart, getNearestPointOnLine } from './geo-utils'

/** Max snap distance (miles) to count a training point as on-course. ~80 m. */
export const OVERLAP_BUFFER_MI = 0.05

/** Sample training route about every this many miles (~80 m). */
export const OVERLAP_SAMPLE_STEP_MI = 0.05

export interface OverlapSegment {
  courseStartMi: number
  courseEndMi: number
  trainingStartMi: number
  trainingEndMi: number
}

export interface TrainingOverlapResult {
  overlapMiles: number
  segments: OverlapSegment[]
}

type LonLat = [number, number]

function cumulativeMiles(line: LonLat[]): number[] {
  const cum: number[] = [0]
  for (let i = 0; i < line.length - 1; i++) {
    cum.push(cum[i] + getDistance(line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]))
  }
  return cum
}

/**
 * Downsample a polyline so consecutive retained points are at least
 * `stepMi` apart along the route (always keep first and last).
 */
export function downsampleByDistance(line: LonLat[], stepMi: number): { coords: LonLat[]; miles: number[] } {
  if (line.length === 0) return { coords: [], miles: [] }
  if (line.length === 1) return { coords: [line[0]], miles: [0] }

  const cum = cumulativeMiles(line)
  const coords: LonLat[] = [line[0]]
  const miles: number[] = [0]
  let lastKept = 0

  for (let i = 1; i < line.length - 1; i++) {
    if (cum[i] - lastKept >= stepMi) {
      coords.push(line[i])
      miles.push(cum[i])
      lastKept = cum[i]
    }
  }

  const last = line[line.length - 1]
  const lastMi = cum[cum.length - 1]
  if (coords[coords.length - 1] !== last) {
    coords.push(last)
    miles.push(lastMi)
  }

  return { coords, miles }
}

/**
 * Compute where a training route overlaps the race course.
 * Samples the training polyline, snaps each sample to the course within
 * OVERLAP_BUFFER_MI, and merges contiguous hits into mile-range segments.
 */
export function computeTrainingOverlap(
  trainingCoords: LonLat[],
  courseCoords: LonLat[],
  options?: { bufferMi?: number; sampleStepMi?: number }
): TrainingOverlapResult {
  const bufferMi = options?.bufferMi ?? OVERLAP_BUFFER_MI
  const sampleStepMi = options?.sampleStepMi ?? OVERLAP_SAMPLE_STEP_MI

  if (trainingCoords.length < 2 || courseCoords.length < 2) {
    return { overlapMiles: 0, segments: [] }
  }

  const { coords, miles } = downsampleByDistance(trainingCoords, sampleStepMi)

  type Hit = { trainingMi: number; courseMi: number; onCourse: boolean }
  const hits: Hit[] = []

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]
    const snapped = getNearestPointOnLine({ lat, lon }, courseCoords)
    if (!snapped || snapped.distance > bufferMi) {
      hits.push({ trainingMi: miles[i], courseMi: NaN, onCourse: false })
      continue
    }
    const courseMi = getDistanceFromStart(
      courseCoords,
      snapped.index,
      { lat: snapped.lat, lon: snapped.lon }
    )
    hits.push({ trainingMi: miles[i], courseMi, onCourse: true })
  }

  const segments: OverlapSegment[] = []
  let active: { trainingStart: number; trainingEnd: number; courseStart: number; courseEnd: number } | null = null

  const flush = () => {
    if (!active) return
    const trainingLen = Math.max(0, active.trainingEnd - active.trainingStart)
    if (trainingLen < 0.01) {
      active = null
      return
    }
    segments.push({
      courseStartMi: Math.min(active.courseStart, active.courseEnd),
      courseEndMi: Math.max(active.courseStart, active.courseEnd),
      trainingStartMi: active.trainingStart,
      trainingEndMi: active.trainingEnd,
    })
    active = null
  }

  for (const hit of hits) {
    if (!hit.onCourse) {
      flush()
      continue
    }
    if (!active) {
      active = {
        trainingStart: hit.trainingMi,
        trainingEnd: hit.trainingMi,
        courseStart: hit.courseMi,
        courseEnd: hit.courseMi,
      }
    } else {
      active.trainingEnd = hit.trainingMi
      active.courseEnd = hit.courseMi
    }
  }
  flush()

  const overlapMiles = segments.reduce(
    (sum, s) => sum + Math.max(0, s.trainingEndMi - s.trainingStartMi),
    0
  )

  return {
    overlapMiles: Math.round(overlapMiles * 100) / 100,
    segments: segments.map(s => ({
      courseStartMi: Math.round(s.courseStartMi * 100) / 100,
      courseEndMi: Math.round(s.courseEndMi * 100) / 100,
      trainingStartMi: Math.round(s.trainingStartMi * 100) / 100,
      trainingEndMi: Math.round(s.trainingEndMi * 100) / 100,
    })),
  }
}

export function formatOverlapSummary(overlapMiles: number, segments: OverlapSegment[]): string {
  if (!overlapMiles || segments.length === 0) return 'No overlap with race course'
  const ranges = segments
    .map(s => {
      if (Math.abs(s.courseEndMi - s.courseStartMi) < 0.05) {
        return `mi ${s.courseStartMi.toFixed(1)}`
      }
      return `mi ${s.courseStartMi.toFixed(1)}–${s.courseEndMi.toFixed(1)}`
    })
    .join(', ')
  return `${overlapMiles.toFixed(1)} mi on course (${ranges})`
}

export function parseOverlapSegments(raw: unknown): OverlapSegment[] {
  if (!Array.isArray(raw)) return []
  const out: OverlapSegment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const courseStartMi = Number(o.courseStartMi)
    const courseEndMi = Number(o.courseEndMi)
    const trainingStartMi = Number(o.trainingStartMi)
    const trainingEndMi = Number(o.trainingEndMi)
    if ([courseStartMi, courseEndMi, trainingStartMi, trainingEndMi].some(n => !Number.isFinite(n))) continue
    out.push({ courseStartMi, courseEndMi, trainingStartMi, trainingEndMi })
  }
  return out
}

export function extractCoordinates(geometry: unknown): LonLat[] {
  if (!geometry || typeof geometry !== 'object') return []
  const coords = (geometry as { coordinates?: unknown }).coordinates
  if (!Array.isArray(coords)) return []
  return coords.filter(
    (c): c is LonLat =>
      Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number'
  )
}

export function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
}
