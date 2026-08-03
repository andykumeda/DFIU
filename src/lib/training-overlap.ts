import { getDistance, getDistanceFromStart, getNearestPointOnLine } from './geo-utils'

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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compute where a training route overlaps the race course.
 *
 * Uses unique course-mile coverage (not a single direction streak), so
 * out-and-backs that cover ~10 mi of trail report ~10 mi — not a short
 * fragment from one leg. `overlapMiles` is the sum of merged course ranges.
 * Segments are contiguous on-course stretches along the training route.
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

  type OnHit = { trainingMi: number; courseMi: number }
  const onHits: OnHit[] = []

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]
    const snapped = getNearestPointOnLine({ lat, lon }, courseCoords)
    if (!snapped || snapped.distance > bufferMi) continue
    const courseMi = getDistanceFromStart(courseCoords, snapped.index, {
      lat: snapped.lat,
      lon: snapped.lon,
    })
    onHits.push({ trainingMi: miles[i], courseMi })
  }

  if (onHits.length < 2) {
    return { overlapMiles: 0, segments: [] }
  }

  let courseRanges = clusterMileRanges(
    onHits.map(h => h.courseMi),
    courseMergeMi
  )
  courseRanges = filterStartFinishCollisionRanges(courseRanges, courseCoords, courseTotalMi)
  if (courseRanges.length === 0) {
    return { overlapMiles: 0, segments: [] }
  }

  const inKeptCourse = (courseMi: number) =>
    courseRanges.some(r => courseMi >= r.start - 0.15 && courseMi <= r.end + 0.15)

  const keptHits = onHits.filter(h => inKeptCourse(h.courseMi))
  if (keptHits.length < 2) {
    return { overlapMiles: 0, segments: [] }
  }

  // Contiguous on-course stretches along the training route.
  type Streak = {
    trainingStart: number
    trainingEnd: number
    courseStart: number
    courseEnd: number
  }
  const streaks: Streak[] = []
  let cur: Streak | null = null
  let lastTraining = -Infinity

  const flush = () => {
    if (!cur) return
    const courseSpan = cur.courseEnd - cur.courseStart
    const trainingSpan = cur.trainingEnd - cur.trainingStart
    if (courseSpan >= 0.15 || trainingSpan >= 0.2) {
      streaks.push(cur)
    }
    cur = null
  }

  for (const hit of keptHits) {
    if (!cur) {
      cur = {
        trainingStart: hit.trainingMi,
        trainingEnd: hit.trainingMi,
        courseStart: hit.courseMi,
        courseEnd: hit.courseMi,
      }
      lastTraining = hit.trainingMi
      continue
    }
    if (hit.trainingMi - lastTraining > gapBridgeMi + 0.15) {
      flush()
      cur = {
        trainingStart: hit.trainingMi,
        trainingEnd: hit.trainingMi,
        courseStart: hit.courseMi,
        courseEnd: hit.courseMi,
      }
      lastTraining = hit.trainingMi
      continue
    }
    cur.trainingEnd = hit.trainingMi
    cur.courseStart = Math.min(cur.courseStart, hit.courseMi)
    cur.courseEnd = Math.max(cur.courseEnd, hit.courseMi)
    lastTraining = hit.trainingMi
  }
  flush()

  if (streaks.length === 0) {
    return { overlapMiles: 0, segments: [] }
  }

  const overlapMiles = round2(
    courseRanges.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0)
  )
  if (overlapMiles < 0.1) {
    return { overlapMiles: 0, segments: [] }
  }

  const segments: OverlapSegment[] = streaks.map(s => ({
    courseStartMi: round2(s.courseStart),
    courseEndMi: round2(s.courseEnd),
    trainingStartMi: round2(s.trainingStart),
    trainingEndMi: round2(s.trainingEnd),
  }))

  return { overlapMiles, segments }
}

export function formatOverlapSummary(overlapMiles: number, segments: OverlapSegment[]): string {
  if (!overlapMiles || segments.length === 0) return 'No overlap with race course'
  // Merge abutting/nearby course spans so out-and-backs read as one range.
  const sorted = segments
    .map(s => ({
      start: Math.min(s.courseStartMi, s.courseEndMi),
      end: Math.max(s.courseStartMi, s.courseEndMi),
    }))
    .sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const r of sorted) {
    const cur = merged[merged.length - 1]
    if (!cur || r.start > cur.end + COURSE_RANGE_MERGE_MI) {
      merged.push({ ...r })
    } else {
      cur.end = Math.max(cur.end, r.end)
    }
  }
  const ranges = merged
    .map(s => {
      if (Math.abs(s.end - s.start) < 0.05) return `mi ${s.start.toFixed(1)}`
      return `mi ${s.start.toFixed(1)}–${s.end.toFixed(1)}`
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
