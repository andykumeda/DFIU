import {
  getAllVisitsOnLine,
  getDistance,
  getDistanceFromStart,
  getNearestPointOnLine,
} from './geo-utils'

/** Max snap distance (miles) to count a training point as on-course. ~200 m — trail GPS drifts. */
export const OVERLAP_BUFFER_MI = 0.12

/** Sample training route about every this many miles (~80 m). */
export const OVERLAP_SAMPLE_STEP_MI = 0.05

/** Bridge brief off-course gaps along the training route (GPS dropouts / switchbacks). */
export const OVERLAP_GAP_BRIDGE_MI = 0.4

/** Map painting uses the same snap distance as analysis (~200 m). */
export const MAP_OVERLAP_BUFFER_MI = OVERLAP_BUFFER_MI

/** Map painting bridges normal GPS gaps between samples on one shared trail. */
export const MAP_OVERLAP_GAP_BRIDGE_MI = 0.4

/** Merge course-mile clusters closer than this into one displayed range. */
export const COURSE_RANGE_MERGE_MI = 1.25

/**
 * Split a contiguous training streak when assigned course miles jump by more than
 * this — typical when switching between out-and-back race visits.
 */
export const COURSE_JUMP_SPLIT_MI = 2.5

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

export interface TrainingMapOverlapSegment {
  trainingStartMi: number
  trainingEndMi: number
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
 * Paint overlap where training GPX is within snap distance of race GPX.
 * Heading and course-mile jumps are ignored so a shared stem stays orange
 * when the race turns off onto a loop.
 */
export function computeTrainingMapOverlap(
  trainingCoords: LonLat[],
  courseCoords: LonLat[],
  options?: { bufferMi?: number; gapBridgeMi?: number }
): TrainingMapOverlapSegment[] {
  if (trainingCoords.length < 2 || courseCoords.length < 2) return []

  const bufferMi = options?.bufferMi ?? MAP_OVERLAP_BUFFER_MI
  const gapBridgeMi = options?.gapBridgeMi ?? MAP_OVERLAP_GAP_BRIDGE_MI
  const { coords, miles } = downsampleByDistance(trainingCoords, OVERLAP_SAMPLE_STEP_MI)
  const ranges: TrainingMapOverlapSegment[] = []
  let start: number | null = null
  let lastHit: number | null = null

  const flush = () => {
    if (start == null || lastHit == null || lastHit - start < 0.05) return
    ranges.push({ trainingStartMi: round2(start), trainingEndMi: round2(lastHit) })
    start = null
    lastHit = null
  }

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]
    const nearest = getNearestPointOnLine({ lat, lon }, courseCoords)
    if (nearest != null && nearest.distance <= bufferMi) {
      if (start == null) start = miles[i]
      lastHit = miles[i]
    } else if (lastHit != null && miles[i] - lastHit > gapBridgeMi) {
      flush()
    }
  }
  flush()
  return ranges
}

type AssignedHit = { trainingMi: number; courseMi: number; lat: number; lon: number }

/**
 * Snap with mile-hint continuity so start/finish colocation and brief GPS noise
 * do not jump between distant course miles. Visit switching for out-and-backs is
 * handled afterward in `splitAndRemapOutAndBack`.
 *
 * Uses a local window around the predicted course mile instead of scanning the
 * whole polyline (important for ~100 mi courses).
 */
function assignCourseMileContinuous(
  pt: { lat: number; lon: number },
  courseCoords: LonLat[],
  courseCum: number[],
  bufferMi: number,
  lastCourseMi: number | null,
  courseVel: number | null,
  trainingDt: number
): number | null {
  const nearest = getNearestPointOnLine(pt, courseCoords)
  if (!nearest || nearest.distance > bufferMi) return null

  const nearestMi = getDistanceFromStart(courseCoords, nearest.index, {
    lat: nearest.lat,
    lon: nearest.lon,
  })

  if (lastCourseMi == null) return nearestMi

  const predicted =
    courseVel != null && Number.isFinite(courseVel) ? lastCourseMi + courseVel * trainingDt : lastCourseMi

  const hintedMi = snapNearPredictedMile(pt, courseCoords, courseCum, predicted, bufferMi, 3)
  if (hintedMi != null && Math.abs(hintedMi - predicted) <= COURSE_JUMP_SPLIT_MI) {
    return hintedMi
  }

  if (Math.abs(nearestMi - lastCourseMi) <= COURSE_JUMP_SPLIT_MI) return nearestMi

  return hintedMi ?? nearestMi
}

/** Project onto course segments whose cumulative mile is near `predictedMi`. */
function snapNearPredictedMile(
  pt: { lat: number; lon: number },
  courseCoords: LonLat[],
  courseCum: number[],
  predictedMi: number,
  bufferMi: number,
  windowMi: number
): number | null {
  if (courseCoords.length < 2) return null
  const lo = predictedMi - windowMi
  const hi = predictedMi + windowMi
  let bestMi: number | null = null
  let bestDist = Infinity
  let bestMileDiff = Infinity

  for (let i = 0; i < courseCoords.length - 1; i++) {
    if (courseCum[i + 1] < lo || courseCum[i] > hi) continue
    const a = courseCoords[i]
    const b = courseCoords[i + 1]
    // Approximate projection using turf nearest on the short segment.
    const snapped = getNearestPointOnLine(pt, [a, b])
    if (!snapped || snapped.distance > bufferMi) continue
    const along = getDistance(a[1], a[0], snapped.lat, snapped.lon)
    const mile = courseCum[i] + along
    const mileDiff = Math.abs(mile - predictedMi)
    if (snapped.distance < bestDist - 1e-6 || (Math.abs(snapped.distance - bestDist) <= 1e-6 && mileDiff < bestMileDiff)) {
      bestDist = snapped.distance
      bestMileDiff = mileDiff
      bestMi = mile
    }
  }
  return bestMi
}

/**
 * Find a clear out-and-back turnaround index within a contiguous hit stretch.
 * Returns null when the stretch is not a directional out-and-back.
 */
function findTurnaroundIndex(hits: AssignedHit[]): number | null {
  if (hits.length < 12) return null

  const earlyCount = Math.max(4, Math.floor(hits.length / 5))
  const earlyTrend = hits[earlyCount - 1].courseMi - hits[0].courseMi
  if (Math.abs(earlyTrend) < 0.75) return null

  let turnIdx = 0
  let turnVal = hits[0].courseMi
  for (let i = 1; i < hits.length; i++) {
    if (earlyTrend < 0 ? hits[i].courseMi < turnVal : hits[i].courseMi > turnVal) {
      turnVal = hits[i].courseMi
      turnIdx = i
    }
  }

  if (turnIdx < hits.length * 0.2 || turnIdx > hits.length * 0.8) return null
  const after = hits.slice(turnIdx, Math.min(hits.length, turnIdx + Math.max(6, Math.floor(hits.length / 10))))
  if (after.length < 3) return null
  const afterTrend = after[after.length - 1].courseMi - after[0].courseMi
  if (afterTrend * earlyTrend >= 0) return null
  if (Math.abs(afterTrend) < 0.5) return null
  return turnIdx
}

/**
 * Within one contiguous on-course training stretch, detect a clear out-and-back
 * turnaround and remap the return leg:
 *
 * - Disconnected race visits (e.g. Newcomb): switch onto the later/earlier pass
 *   and keep outbound/return as separate legs (different times of day).
 * - Continuous race out-and-back (e.g. Hillyer): when the first pass retraced the
 *   outbound visit, mirror past the turnaround so course miles keep advancing,
 *   and keep one combined leg (no gap).
 * - Already-correct continuous passes (course miles never retrace) are left alone.
 */
function splitAndRemapOutAndBack(
  hits: AssignedHit[],
  courseCoords: LonLat[],
  bufferMi: number
): AssignedHit[][] {
  const turnIdx = findTurnaroundIndex(hits)
  if (turnIdx == null) return [hits]

  const outbound = hits.slice(0, turnIdx + 1)
  const returning = hits.slice(turnIdx).map(h => ({ ...h }))
  if (returning.length < 2) return [hits]

  const turn = hits[turnIdx]
  const earlyTrend = hits[Math.max(4, Math.floor(hits.length / 5)) - 1].courseMi - hits[0].courseMi
  const outLo = Math.min(...outbound.map(h => h.courseMi))
  const outHi = Math.max(...outbound.map(h => h.courseMi))
  const returnEnd = returning[returning.length - 1].courseMi
  const retracingOutbound = returnEnd >= outLo - 0.3 && returnEnd <= outHi + 0.3

  if (!retracingOutbound) {
    // Course miles already continue past the turnaround (mirrored race OAB).
    // Still split legs so the outbound and return keep distinct endpoints.
    return [outbound, returning]
  }

  const visits = getAllVisitsOnLine({ lat: turn.lat, lon: turn.lon }, courseCoords, bufferMi, 0.75).filter(
    v => v.distance <= bufferMi
  )
  const candidates = visits.filter(v => Math.abs(v.mile - turn.courseMi) > COURSE_JUMP_SPLIT_MI)

  if (candidates.length > 0) {
    // Race revisits this trail later/earlier — map return onto that pass.
    const preferLater = earlyTrend < 0
    const chosen =
      candidates.find(v => (preferLater ? v.mile > turn.courseMi : v.mile < turn.courseMi)) ??
      candidates.sort((a, b) => Math.abs(b.mile - turn.courseMi) - Math.abs(a.mile - turn.courseMi))[0]

    for (let i = 0; i < returning.length; i++) {
      returning[i].courseMi = chosen.mile + (turn.courseMi - hits[turnIdx + i].courseMi)
    }
    return [outbound, returning]
  }

  // Continuous race out-and-back: mirror mistaken reverse-on-same-visit snaps
  // past the apex so miles keep advancing (Hillyer).
  for (let i = 0; i < returning.length; i++) {
    returning[i].courseMi = 2 * turn.courseMi - hits[turnIdx + i].courseMi
  }
  return [outbound.concat(returning.slice(1))]
}

/**
 * Compute where a training route overlaps the race course.
 *
 * Samples the training route, snaps each point with course-mile continuity, then
 * remaps clear out-and-back return legs:
 * - disconnected race visits → separate segments / times of day
 * - continuous race out-and-backs → one advancing course-mile span
 * `overlapMiles` is unique course-mile coverage across those segments.
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

  const rawHits: AssignedHit[] = []
  let lastCourseMi: number | null = null
  let courseVel: number | null = null
  let lastTrainingMi: number | null = null

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i]
    const trainingMi = miles[i]
    const trainingDt = lastTrainingMi == null ? 0 : Math.max(1e-6, trainingMi - lastTrainingMi)

    const courseMi = assignCourseMileContinuous(
      { lat, lon },
      courseCoords,
      courseCum,
      bufferMi,
      lastCourseMi,
      courseVel,
      trainingDt
    )
    if (courseMi == null) {
      if (lastTrainingMi != null && trainingMi - lastTrainingMi > gapBridgeMi) {
        lastCourseMi = null
        courseVel = null
      }
      continue
    }

    if (lastCourseMi != null && lastTrainingMi != null && trainingDt > 0) {
      const jump = Math.abs(courseMi - lastCourseMi)
      if (jump > COURSE_JUMP_SPLIT_MI) {
        courseVel = null
      } else {
        const inst = (courseMi - lastCourseMi) / trainingDt
        if (Math.abs(inst) <= 4) {
          courseVel = courseVel == null ? inst : courseVel * 0.4 + inst * 0.6
        }
      }
    }

    rawHits.push({ trainingMi, courseMi, lat, lon })
    lastCourseMi = courseMi
    lastTrainingMi = trainingMi
  }

  if (rawHits.length < 2) {
    return { overlapMiles: 0, segments: [] }
  }

  // Split on training gaps, then split/remap each contiguous stretch for out-and-backs.
  const groups: AssignedHit[][] = []
  let group: AssignedHit[] = [rawHits[0]]
  for (let i = 1; i < rawHits.length; i++) {
    if (rawHits[i].trainingMi - rawHits[i - 1].trainingMi > gapBridgeMi + 0.15) {
      groups.push(group)
      group = [rawHits[i]]
    } else {
      group.push(rawHits[i])
    }
  }
  groups.push(group)

  const legs = groups.flatMap(g => splitAndRemapOutAndBack(g, courseCoords, bufferMi))
  const onHits = legs.flat()

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

  type Streak = {
    trainingStart: number
    trainingEnd: number
    courseStart: number
    courseEnd: number
    lastCourse: number
    lastTraining: number
  }
  const streaks: Streak[] = []

  const flushStreak = (cur: Streak | null) => {
    if (!cur) return
    const courseSpan = Math.abs(cur.courseEnd - cur.courseStart)
    const trainingSpan = cur.trainingEnd - cur.trainingStart
    if (courseSpan >= 0.15 || trainingSpan >= 0.2) {
      streaks.push(cur)
    }
  }

  // Build streaks per leg so out-and-back halves stay separate even on one visit.
  for (const leg of legs) {
    const keptHits = leg.filter(h => inKeptCourse(h.courseMi))
    if (keptHits.length < 2) continue

    let cur: Streak | null = null
    for (const hit of keptHits) {
      if (!cur) {
        cur = {
          trainingStart: hit.trainingMi,
          trainingEnd: hit.trainingMi,
          courseStart: hit.courseMi,
          courseEnd: hit.courseMi,
          lastCourse: hit.courseMi,
          lastTraining: hit.trainingMi,
        }
        continue
      }
      const trainingGap = hit.trainingMi - cur.lastTraining
      const courseJump = Math.abs(hit.courseMi - cur.lastCourse)
      if (trainingGap > gapBridgeMi + 0.15 || courseJump > COURSE_JUMP_SPLIT_MI) {
        flushStreak(cur)
        cur = {
          trainingStart: hit.trainingMi,
          trainingEnd: hit.trainingMi,
          courseStart: hit.courseMi,
          courseEnd: hit.courseMi,
          lastCourse: hit.courseMi,
          lastTraining: hit.trainingMi,
        }
        continue
      }
      cur.trainingEnd = hit.trainingMi
      cur.courseEnd = hit.courseMi
      cur.lastCourse = hit.courseMi
      cur.lastTraining = hit.trainingMi
    }
    flushStreak(cur)
  }

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

export function formatOverlapSummary(
  overlapMiles: number,
  segments: OverlapSegment[],
  options?: { elevationGainFt?: number | null }
): string {
  if (!overlapMiles || segments.length === 0) return 'No overlap with race course'
  // Merge abutting/nearby course spans so adjacent sections read as one range.
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
  const elev =
    options?.elevationGainFt != null && Number.isFinite(options.elevationGainFt)
      ? `, +${Math.round(options.elevationGainFt).toLocaleString()} ft`
      : ''
  return `${overlapMiles.toFixed(1)} mi on course${elev} (${ranges})`
}

/** Sum race-course elevation gain (ft) over unique overlapped course-mile ranges. */
export function courseOverlapElevationGainFt(
  elevationSamples: { distance: number; elevation: number }[] | null | undefined,
  segments: OverlapSegment[]
): number | null {
  if (!elevationSamples || elevationSamples.length < 2 || segments.length === 0) return null

  const sorted = segments
    .map(s => ({
      start: Math.min(s.courseStartMi, s.courseEndMi),
      end: Math.max(s.courseStartMi, s.courseEndMi),
    }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const r of sorted) {
    const cur = merged[merged.length - 1]
    if (!cur || r.start > cur.end + COURSE_RANGE_MERGE_MI) merged.push({ ...r })
    else cur.end = Math.max(cur.end, r.end)
  }
  if (merged.length === 0) return null

  let gain = 0
  for (const range of merged) {
    gain += elevationGainBetweenMiles(elevationSamples, range.start, range.end)
  }
  return round2(gain)
}

function elevationGainBetweenMiles(
  samples: { distance: number; elevation: number }[],
  startMi: number,
  endMi: number
): number {
  const lo = Math.min(startMi, endMi)
  const hi = Math.max(startMi, endMi)
  let gain = 0
  let prevElev: number | null = null
  for (const sample of samples) {
    if (sample.distance < lo - 1e-6) continue
    if (sample.distance > hi + 1e-6) break
    if (prevElev != null) {
      const d = sample.elevation - prevElev
      if (d > 0) gain += d
    }
    prevElev = sample.elevation
  }
  return gain
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

export interface TrainingOverlapUpdate {
  id: string
  overlap_miles: number
  overlap_segments: OverlapSegment[]
}

/** Build database updates from route geometry; persisted overlap values are never reused. */
export function buildTrainingOverlapUpdates<TRoute extends { id: string; geometry: unknown }>(
  routes: ReadonlyArray<TRoute>,
  courseGeometry: unknown
): TrainingOverlapUpdate[] {
  const courseCoords = extractCoordinates(courseGeometry)
  if (courseCoords.length < 2) return []

  return routes.map(route => {
    const overlap = computeTrainingOverlap(extractCoordinates(route.geometry), courseCoords)
    return {
      id: route.id,
      overlap_miles: overlap.overlapMiles,
      overlap_segments: overlap.segments,
    }
  })
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
