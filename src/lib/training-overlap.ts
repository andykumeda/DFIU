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
 *
 * Out-and-back on the same trail (reverse then forward) is split into
 * direction streaks; we report the streak that covers the most course miles.
 * `overlapMiles` is that course span (e.g. 90.4→100.8 ≈ 10.4), not bridged
 * training length.
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

  // Pass 1: naive snaps to discover the dominant course cluster.
  const prelimCourseMiles: number[] = []
  for (const [lon, lat] of coords) {
    const snapped = getNearestPointOnLine({ lat, lon }, courseCoords)
    if (!snapped || snapped.distance > bufferMi) continue
    prelimCourseMiles.push(
      getDistanceFromStart(courseCoords, snapped.index, {
        lat: snapped.lat,
        lon: snapped.lon,
      })
    )
  }
  let prelimRanges = clusterMileRanges(prelimCourseMiles, courseMergeMi)
  prelimRanges = filterStartFinishCollisionRanges(prelimRanges, courseCoords, courseTotalMi)
  const primaryRange = prelimRanges.reduce<(typeof prelimRanges)[0] | null>((best, r) => {
    const len = r.end - r.start
    if (!best || len > best.end - best.start) return r
    return best
  }, null)
  const primaryHint = primaryRange ? (primaryRange.start + primaryRange.end) / 2 : undefined

  type Hit = { trainingMi: number; courseMi: number; onCourse: boolean }
  const hits: Hit[] = []
  let mileHint = primaryHint

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]
    const visit = pickCourseVisit(lat, lon, courseCoords, bufferMi, mileHint)
    if (!visit) {
      hits.push({ trainingMi: miles[i], courseMi: NaN, onCourse: false })
      continue
    }
    if (
      primaryRange &&
      primaryRange.start > courseTotalMi * 0.5 &&
      visit.courseMi < Math.min(5, courseTotalMi * 0.08)
    ) {
      hits.push({ trainingMi: miles[i], courseMi: NaN, onCourse: false })
      continue
    }
    mileHint = visit.courseMi
    hits.push({ trainingMi: miles[i], courseMi: visit.courseMi, onCourse: true })
  }

  type OnHit = { trainingMi: number; courseMi: number }
  const onHits: OnHit[] = hits
    .filter(h => h.onCourse && Number.isFinite(h.courseMi))
    .map(h => ({ trainingMi: h.trainingMi, courseMi: h.courseMi }))

  if (onHits.length < 2) {
    return { overlapMiles: 0, segments: [] }
  }

  type Streak = {
    trainingStart: number
    trainingEnd: number
    courseStart: number
    courseEnd: number
    /** Farthest course mile in the travel direction (min if reverse, max if forward). */
    courseExtreme: number
    direction: 1 | -1 | 0
  }

  const streaks: Streak[] = []
  let cur: Streak | null = null
  let lastTraining = -Infinity

  const flushStreak = () => {
    if (!cur) return
    if (Math.abs(cur.courseEnd - cur.courseStart) >= 0.15 || cur.trainingEnd - cur.trainingStart >= 0.2) {
      streaks.push(cur)
    }
    cur = null
  }

  for (const hit of onHits) {
    if (!cur) {
      cur = {
        trainingStart: hit.trainingMi,
        trainingEnd: hit.trainingMi,
        courseStart: hit.courseMi,
        courseEnd: hit.courseMi,
        courseExtreme: hit.courseMi,
        direction: 0,
      }
      lastTraining = hit.trainingMi
      continue
    }

    const delta = hit.courseMi - cur.courseEnd
    const dir: 1 | -1 | 0 = Math.abs(delta) < 0.08 ? cur.direction : delta > 0 ? 1 : -1

    // Turnaround vs the extreme reached in the established direction (not last point).
    const reverses =
      cur.direction === 1
        ? hit.courseMi < cur.courseExtreme - 0.25
        : cur.direction === -1
          ? hit.courseMi > cur.courseExtreme + 0.25
          : false

    const trainingGap = hit.trainingMi - lastTraining > gapBridgeMi + 0.15
    const courseContinues =
      cur.direction === 0 ||
      (cur.direction === 1 && hit.courseMi >= cur.courseExtreme - 0.35) ||
      (cur.direction === -1 && hit.courseMi <= cur.courseExtreme + 0.35)

    if (reverses || (trainingGap && !courseContinues)) {
      flushStreak()
      cur = {
        trainingStart: hit.trainingMi,
        trainingEnd: hit.trainingMi,
        courseStart: hit.courseMi,
        courseEnd: hit.courseMi,
        courseExtreme: hit.courseMi,
        direction: 0,
      }
      lastTraining = hit.trainingMi
      continue
    }

    cur.trainingEnd = hit.trainingMi
    cur.courseEnd = hit.courseMi
    if (cur.direction === 0 && dir !== 0) cur.direction = dir
    if (cur.direction === 1) cur.courseExtreme = Math.max(cur.courseExtreme, hit.courseMi)
    else if (cur.direction === -1) cur.courseExtreme = Math.min(cur.courseExtreme, hit.courseMi)
    else cur.courseExtreme = hit.courseMi
    lastTraining = hit.trainingMi
  }
  flushStreak()

  if (streaks.length === 0) {
    return { overlapMiles: 0, segments: [] }
  }

  const best = streaks.reduce((a, b) =>
    Math.abs(b.courseEnd - b.courseStart) > Math.abs(a.courseEnd - a.courseStart) ? b : a
  )

  const courseStartMi = Math.min(best.courseStart, best.courseEnd)
  const courseEndMi = Math.max(best.courseStart, best.courseEnd)

  const filteredRanges = filterStartFinishCollisionRanges(
    [{ start: courseStartMi, end: courseEndMi }],
    courseCoords,
    courseTotalMi
  )
  if (filteredRanges.length === 0) {
    return { overlapMiles: 0, segments: [] }
  }

  const overlapMiles = Math.round((filteredRanges[0].end - filteredRanges[0].start) * 100) / 100
  if (overlapMiles < 0.1) {
    return { overlapMiles: 0, segments: [] }
  }

  return {
    overlapMiles,
    segments: [
      {
        courseStartMi: Math.round(filteredRanges[0].start * 100) / 100,
        courseEndMi: Math.round(filteredRanges[0].end * 100) / 100,
        trainingStartMi: Math.round(best.trainingStart * 100) / 100,
        trainingEndMi: Math.round(best.trainingEnd * 100) / 100,
      },
    ],
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

/** Driving directions from finish back to start (shuttle / car spot). */
export function returnDirectionsUrl(
  finishLat: number,
  finishLon: number,
  startLat: number,
  startLon: number
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${finishLat},${finishLon}&destination=${startLat},${startLon}`
}

/** Point-to-point if start and finish are farther apart than this (miles). */
export const POINT_TO_POINT_MIN_SEPARATION_MI = 0.35

export function isPointToPointRoute(
  startLat: number | null | undefined,
  startLon: number | null | undefined,
  finishLat: number | null | undefined,
  finishLon: number | null | undefined,
  minSeparationMi: number = POINT_TO_POINT_MIN_SEPARATION_MI
): boolean {
  if (
    startLat == null ||
    startLon == null ||
    finishLat == null ||
    finishLon == null ||
    !Number.isFinite(startLat) ||
    !Number.isFinite(startLon) ||
    !Number.isFinite(finishLat) ||
    !Number.isFinite(finishLon)
  ) {
    return false
  }
  return getDistance(startLat, startLon, finishLat, finishLon) >= minSeparationMi
}

export function nameFromGpxFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.gpx$/i, '').trim()
  return base || 'Training route'
}

/** Best-effort name from raw GPX (metadata/track name). */
export function nameFromRawGpx(rawGpx: string | null | undefined): string | null {
  if (!rawGpx) return null
  try {
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(rawGpx, 'application/xml')
      if (!doc.querySelector('parsererror')) {
        const meta = doc.querySelector('gpx > metadata > name, gpx > name')?.textContent?.trim()
        if (meta) return meta
        const trk = doc.querySelector('trk > name')?.textContent?.trim()
        if (trk) return trk
      }
    }
  } catch {
    /* fall through */
  }
  const trk = rawGpx.match(/<trk[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i)
  if (trk?.[1]?.trim()) return trk[1].trim()
  const meta = rawGpx.match(/<metadata[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i)
  if (meta?.[1]?.trim()) return meta[1].trim()
  return null
}
