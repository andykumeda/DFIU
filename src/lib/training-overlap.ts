import { getDistance, getDistanceFromStart, getAllVisitsOnLine, getNearestPointOnLine } from './geo-utils'

/** Max snap distance (miles) to count a training point as on-course. ~200 m — trail GPS drifts. */
export const OVERLAP_BUFFER_MI = 0.12

/** Sample training route about every this many miles (~80 m). */
export const OVERLAP_SAMPLE_STEP_MI = 0.05

/** Bridge brief off-course gaps along the training route (GPS dropouts / switchbacks). */
export const OVERLAP_GAP_BRIDGE_MI = 0.4

/** Merge course-mile clusters closer than this into one displayed range. */
export const COURSE_RANGE_MERGE_MI = 1.25

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

/** Cluster sorted numeric values into contiguous ranges. */
export function clusterMileRanges(values: number[], mergeGapMi: number): { start: number; end: number }[] {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return []

  const ranges: { start: number; end: number }[] = [{ start: sorted[0], end: sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]
    const cur = ranges[ranges.length - 1]
    if (v - cur.end <= mergeGapMi) {
      cur.end = v
    } else {
      ranges.push({ start: v, end: v })
    }
  }
  return ranges
}

/**
 * When start and finish are colocated, nearest-point often also reports mile ~0
 * while training on the finishing miles. Drop small early-course clusters if a
 * substantial late-course cluster exists.
 */
export function filterStartFinishCollisionRanges(
  ranges: { start: number; end: number }[],
  courseCoords: LonLat[],
  courseTotalMi: number
): { start: number; end: number }[] {
  if (ranges.length < 2 || courseCoords.length < 2 || courseTotalMi < 10) return ranges
  const start = courseCoords[0]
  const end = courseCoords[courseCoords.length - 1]
  const startFinishDist = getDistance(start[1], start[0], end[1], end[0])
  if (startFinishDist > 0.3) return ranges

  const hasLate = ranges.some(r => r.start > courseTotalMi * 0.5)
  if (!hasLate) return ranges

  return ranges.filter(r => {
    const nearStart = r.end < Math.min(5, courseTotalMi * 0.08)
    const small = r.end - r.start < 5
    return !(nearStart && small)
  })
}

function pickCourseVisit(
  lat: number,
  lon: number,
  courseCoords: LonLat[],
  bufferMi: number,
  mileHint: number | undefined
): { courseMi: number; distance: number } | null {
  const visits = getAllVisitsOnLine({ lat, lon }, courseCoords, bufferMi, 0.5)
  if (visits.length > 0) {
    let chosen = visits[0]
    if (mileHint !== undefined) {
      for (const v of visits) {
        if (Math.abs(v.mile - mileHint) < Math.abs(chosen.mile - mileHint)) chosen = v
      }
    } else if (visits.length > 1) {
      // No hint yet: prefer the later course mile (finish-area training is common).
      for (const v of visits) {
        if (v.mile > chosen.mile) chosen = v
      }
    }
    return { courseMi: chosen.mile, distance: chosen.distance }
  }

  const snapped = getNearestPointOnLine({ lat, lon }, courseCoords, mileHint)
  if (!snapped || snapped.distance > bufferMi) return null
  const courseMi = getDistanceFromStart(courseCoords, snapped.index, {
    lat: snapped.lat,
    lon: snapped.lon,
  })
  return { courseMi, distance: snapped.distance }
}

/**
 * Compute where a training route overlaps the race course.
 * Samples the training polyline, snaps each sample to the course within
 * OVERLAP_BUFFER_MI, bridges brief GPS gaps, and merges course mile ranges.
 */
export function computeTrainingOverlap(
  trainingCoords: LonLat[],
  courseCoords: LonLat[],
  options?: {
    bufferMi?: number
    sampleStepMi?: number
    gapBridgeMi?: number
    courseMergeMi?: number
  }
): TrainingOverlapResult {
  const bufferMi = options?.bufferMi ?? OVERLAP_BUFFER_MI
  const sampleStepMi = options?.sampleStepMi ?? OVERLAP_SAMPLE_STEP_MI
  const gapBridgeMi = options?.gapBridgeMi ?? OVERLAP_GAP_BRIDGE_MI
  const courseMergeMi = options?.courseMergeMi ?? COURSE_RANGE_MERGE_MI

  if (trainingCoords.length < 2 || courseCoords.length < 2) {
    return { overlapMiles: 0, segments: [] }
  }

  const { coords, miles } = downsampleByDistance(trainingCoords, sampleStepMi)
  const courseCum = cumulativeMiles(courseCoords)
  const courseTotalMi = courseCum.length ? courseCum[courseCum.length - 1] : 0

  type Hit = { trainingMi: number; courseMi: number; onCourse: boolean }
  const hits: Hit[] = []
  let mileHint: number | undefined

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]
    const visit = pickCourseVisit(lat, lon, courseCoords, bufferMi, mileHint)
    if (!visit) {
      hits.push({ trainingMi: miles[i], courseMi: NaN, onCourse: false })
      continue
    }
    mileHint = visit.courseMi
    hits.push({ trainingMi: miles[i], courseMi: visit.courseMi, onCourse: true })
  }

  type Run = {
    trainingStart: number
    trainingEnd: number
    courseMiles: number[]
    lastOnCourseTrainingMi: number
  }
  const runs: Run[] = []
  let active: Run | null = null

  const flush = () => {
    if (!active) return
    const trainingLen = Math.max(0, active.trainingEnd - active.trainingStart)
    if (trainingLen >= 0.05 && active.courseMiles.length > 0) {
      runs.push(active)
    }
    active = null
  }

  for (const hit of hits) {
    if (hit.onCourse) {
      if (!active) {
        active = {
          trainingStart: hit.trainingMi,
          trainingEnd: hit.trainingMi,
          courseMiles: [hit.courseMi],
          lastOnCourseTrainingMi: hit.trainingMi,
        }
      } else {
        active.trainingEnd = hit.trainingMi
        active.courseMiles.push(hit.courseMi)
        active.lastOnCourseTrainingMi = hit.trainingMi
      }
      continue
    }

    if (active && hit.trainingMi - active.lastOnCourseTrainingMi <= gapBridgeMi) {
      active.trainingEnd = hit.trainingMi
      continue
    }
    flush()
  }
  flush()

  const allCourseMiles = runs.flatMap(r => r.courseMiles)
  let courseRanges = clusterMileRanges(allCourseMiles, courseMergeMi)
  courseRanges = filterStartFinishCollisionRanges(courseRanges, courseCoords, courseTotalMi)

  if (courseRanges.length === 0 || runs.length === 0) {
    return { overlapMiles: 0, segments: [] }
  }

  const inKeptRange = (courseMi: number) =>
    courseRanges.some(r => courseMi >= r.start - 0.05 && courseMi <= r.end + 0.05)

  const keptRuns: Run[] = []
  let keptActive: Run | null = null
  const flushKept = () => {
    if (!keptActive) return
    if (keptActive.trainingEnd - keptActive.trainingStart >= 0.05) keptRuns.push(keptActive)
    keptActive = null
  }

  for (const hit of hits) {
    const keep = hit.onCourse && inKeptRange(hit.courseMi)
    if (keep) {
      if (!keptActive) {
        keptActive = {
          trainingStart: hit.trainingMi,
          trainingEnd: hit.trainingMi,
          courseMiles: [hit.courseMi],
          lastOnCourseTrainingMi: hit.trainingMi,
        }
      } else {
        keptActive.trainingEnd = hit.trainingMi
        keptActive.courseMiles.push(hit.courseMi)
        keptActive.lastOnCourseTrainingMi = hit.trainingMi
      }
      continue
    }
    if (keptActive && hit.trainingMi - keptActive.lastOnCourseTrainingMi <= gapBridgeMi) {
      keptActive.trainingEnd = hit.trainingMi
      continue
    }
    flushKept()
  }
  flushKept()

  if (keptRuns.length === 0) {
    return { overlapMiles: 0, segments: [] }
  }

  const trainingStart = Math.min(...keptRuns.map(r => r.trainingStart))
  const trainingEnd = Math.max(...keptRuns.map(r => r.trainingEnd))
  const overlapMiles =
    Math.round(
      keptRuns.reduce((sum, r) => sum + Math.max(0, r.trainingEnd - r.trainingStart), 0) * 100
    ) / 100

  const segments: OverlapSegment[] = courseRanges.map(range => ({
    courseStartMi: Math.round(range.start * 100) / 100,
    courseEndMi: Math.round(range.end * 100) / 100,
    trainingStartMi: Math.round(trainingStart * 100) / 100,
    trainingEndMi: Math.round(trainingEnd * 100) / 100,
  }))

  return { overlapMiles, segments }
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

export function nameFromGpxFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.gpx$/i, '').trim()
  return base || 'Training route'
}
