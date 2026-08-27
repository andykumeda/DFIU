import type { Race } from '@/types/database'
import {
  computeTrainingMapOverlap,
  mergeContinuousOverlapSegments,
  uniqueCourseMileRanges,
  uniqueCourseMiles,
  type OverlapSegment,
} from '@/lib/training-overlap'
import { getDistance } from '@/lib/geo-utils'

export { uniqueCourseMileRanges, uniqueCourseMiles }
import type { PacePlanResult } from './pace-utils'
import { getOverlapRacePace } from './race-day-utils'
import {
  aidStationSectionLabel,
  splitOverlapAtAidStations,
  type OfficialAidStation,
} from './training-aid-segments'

export interface TrainingPlanSummary {
  raceMilesLabel: string
  raceMilesTotal: number
  raceTimeLabel: string | null
  raceDurationMinutes: number | null
  raceDurationLabel: string | null
  trainingMilesLabel: string
  trainingMilesTotal: number
  segments: TrainingPlanSegment[]
}

export interface TrainingPlanSegment {
  sectionLabel: string | null
  courseMilesLabel: string
  trainingMilesLabel: string
  trainingStartMi: number
  trainingEndMi: number
  courseStartMi: number
  courseEndMi: number
  raceDurationMinutes: number | null
  raceDurationLabel: string | null
}

export interface ActivityDistanceTimeStream {
  distanceMeters: number[]
  elapsedSeconds: number[]
  moving: boolean[]
  latlng?: [number, number][]
}

export interface ActivityCourseSlice extends OverlapSegment {
  elapsedStartSeconds?: number
  elapsedEndSeconds?: number
}

export interface TrainingAnalysisDelta {
  deltaMinutes: number
  label: string
  tone: 'faster' | 'slower' | 'even'
}

// GPS traces and an older course GPX can briefly converge near an aid station
// without sharing a usable route section. This matches the prior detail-view
// threshold and keeps those proximity blips out of planning and comparisons.
const MIN_ROUTE_PLAN_SECTION_MI = 0.25

function formatMile(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatDurationWords(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  if (hours === 0) return `${mins} min${mins === 1 ? '' : 's'}`
  if (mins === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours} hour${hours === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'}`
}

export function isSameTrainingOverlap(
  a: { trainingStartMi: number; trainingEndMi: number } | null | undefined,
  b: { trainingStartMi: number; trainingEndMi: number }
): boolean {
  if (!a) return false
  return (
    Math.abs(a.trainingStartMi - b.trainingStartMi) < 0.05 &&
    Math.abs(a.trainingEndMi - b.trainingEndMi) < 0.05
  )
}

/** Race-order sort: earlier course miles first; longer span before short reverse stubs. */
export function sortOverlapSegmentsByRaceMile<T extends OverlapSegment>(segments: T[]): T[] {
  return [...segments].sort((a, b) => {
    const aStart = Math.min(a.courseStartMi, a.courseEndMi)
    const bStart = Math.min(b.courseStartMi, b.courseEndMi)
    if (aStart !== bStart) return aStart - bStart
    const aSpan = Math.abs(a.courseEndMi - a.courseStartMi)
    const bSpan = Math.abs(b.courseEndMi - b.courseStartMi)
    if (aSpan !== bSpan) return bSpan - aSpan
    return a.courseStartMi - b.courseStartMi
  })
}

function projectCourseMileToTraining(segment: OverlapSegment, courseMi: number): number {
  const courseSpan = segment.courseEndMi - segment.courseStartMi
  if (Math.abs(courseSpan) < 1e-9) return segment.trainingStartMi
  const ratio = (courseMi - segment.courseStartMi) / courseSpan
  return segment.trainingStartMi + ratio * (segment.trainingEndMi - segment.trainingStartMi)
}

/**
 * Keep one training pass for each race mile, preferring the pass that travels
 * in race direction. This is what makes an out-and-back training run count as
 * one traversal when the race uses the shared corridor only once.
 */
export function selectUniqueRacePassSegments(segments: OverlapSegment[]): OverlapSegment[] {
  const candidates = [...segments].sort((a, b) => {
    const aForward = a.courseEndMi >= a.courseStartMi ? 0 : 1
    const bForward = b.courseEndMi >= b.courseStartMi ? 0 : 1
    return aForward - bForward || a.trainingStartMi - b.trainingStartMi
  })
  const covered: Array<{ start: number; end: number }> = []
  const selected: OverlapSegment[] = []

  for (const segment of candidates) {
    const lo = Math.min(segment.courseStartMi, segment.courseEndMi)
    const hi = Math.max(segment.courseStartMi, segment.courseEndMi)
    if (!(hi > lo)) continue
    let remaining = [{ start: lo, end: hi }]
    for (const range of covered) {
      remaining = remaining.flatMap(piece => {
        if (range.end <= piece.start || range.start >= piece.end) return [piece]
        const pieces: Array<{ start: number; end: number }> = []
        if (range.start > piece.start) pieces.push({ start: piece.start, end: Math.min(range.start, piece.end) })
        if (range.end < piece.end) pieces.push({ start: Math.max(range.end, piece.start), end: piece.end })
        return pieces
      })
    }
    for (const piece of remaining) {
      const courseStartMi = segment.courseEndMi >= segment.courseStartMi ? piece.start : piece.end
      const courseEndMi = segment.courseEndMi >= segment.courseStartMi ? piece.end : piece.start
      selected.push({
        courseStartMi,
        courseEndMi,
        trainingStartMi: projectCourseMileToTraining(segment, courseStartMi),
        trainingEndMi: projectCourseMileToTraining(segment, courseEndMi),
      })
      covered.push(piece)
    }
    covered.sort((a, b) => a.start - b.start)
    for (let index = covered.length - 1; index > 0; index -= 1) {
      if (covered[index].start <= covered[index - 1].end) {
        covered[index - 1].end = Math.max(covered[index - 1].end, covered[index].end)
        covered.splice(index, 1)
      }
    }
  }
  return selected.sort((a, b) => a.trainingStartMi - b.trainingStartMi)
}

/** Correlate a Strava GPS trace to race miles and scale trace miles to Strava's official distance stream. */
export function buildActivityCourseSegments(
  latlng: [number, number][] | null | undefined,
  activityDistanceMiles: number | null,
  courseCoordinates: [number, number][],
  elapsedSeconds?: number[] | null
): ActivityCourseSlice[] {
  if (!latlng || latlng.length < 2 || !activityDistanceMiles || activityDistanceMiles <= 0 || courseCoordinates.length < 2) return []
  const activityCoordinates = latlng
    .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([lat, lon]) => [lon, lat] as [number, number])
  if (activityCoordinates.length < 2) return []
  const cumulativeGeometricMiles = [0]
  for (let index = 1; index < activityCoordinates.length; index += 1) {
    cumulativeGeometricMiles.push(cumulativeGeometricMiles[index - 1] + getDistance(
      activityCoordinates[index - 1][1],
      activityCoordinates[index - 1][0],
      activityCoordinates[index][1],
      activityCoordinates[index][0]
    ))
  }
  const geometricMiles = cumulativeGeometricMiles[cumulativeGeometricMiles.length - 1]
  if (!(geometricMiles > 0)) return []
  const distanceScale = activityDistanceMiles / geometricMiles
  const raw = computeTrainingMapOverlap(activityCoordinates, courseCoordinates, { mergeAdjacent: false })
  const selected = selectUniqueRacePassSegments(mergeContinuousOverlapSegments(raw))
  const canMapElapsed = elapsedSeconds?.length === cumulativeGeometricMiles.length
  const streamValueAtMile = (mile: number): number | undefined => {
    if (!canMapElapsed || !elapsedSeconds) return undefined
    let index = 1
    while (index < cumulativeGeometricMiles.length && cumulativeGeometricMiles[index] < mile) index += 1
    if (index >= cumulativeGeometricMiles.length) return elapsedSeconds[elapsedSeconds.length - 1]
    const previousMile = cumulativeGeometricMiles[index - 1]
    const span = cumulativeGeometricMiles[index] - previousMile
    if (!(span > 0)) return elapsedSeconds[index]
    const ratio = (mile - previousMile) / span
    return elapsedSeconds[index - 1] + ratio * (elapsedSeconds[index] - elapsedSeconds[index - 1])
  }
  return selected.map(segment => ({
    ...segment,
    elapsedStartSeconds: streamValueAtMile(segment.trainingStartMi),
    elapsedEndSeconds: streamValueAtMile(segment.trainingEndMi),
    trainingStartMi: segment.trainingStartMi * distanceScale,
    trainingEndMi: segment.trainingEndMi * distanceScale,
  }))
}

/** Map a race-course section to the corresponding distance ranges in an activity. */
export function getActivityCourseSlices(
  section: Pick<TrainingPlanSegment, 'courseStartMi' | 'courseEndMi'>,
  activitySegments: ActivityCourseSlice[]
): ActivityCourseSlice[] {
  const sectionLo = Math.min(section.courseStartMi, section.courseEndMi)
  const sectionHi = Math.max(section.courseStartMi, section.courseEndMi)
  return activitySegments.flatMap(segment => {
    const lo = Math.max(sectionLo, Math.min(segment.courseStartMi, segment.courseEndMi))
    const hi = Math.min(sectionHi, Math.max(segment.courseStartMi, segment.courseEndMi))
    if (!(hi > lo)) return []
    return [{
      courseStartMi: lo,
      courseEndMi: hi,
      trainingStartMi: projectCourseMileToTraining(segment, lo),
      trainingEndMi: projectCourseMileToTraining(segment, hi),
      elapsedStartSeconds: typeof segment.elapsedStartSeconds === 'number' && typeof segment.elapsedEndSeconds === 'number'
        ? segment.elapsedStartSeconds + ((lo - segment.courseStartMi) / (segment.courseEndMi - segment.courseStartMi)) * (segment.elapsedEndSeconds - segment.elapsedStartSeconds)
        : undefined,
      elapsedEndSeconds: typeof segment.elapsedStartSeconds === 'number' && typeof segment.elapsedEndSeconds === 'number'
        ? segment.elapsedStartSeconds + ((hi - segment.courseStartMi) / (segment.courseEndMi - segment.courseStartMi)) * (segment.elapsedEndSeconds - segment.elapsedStartSeconds)
        : undefined,
    }]
  })
}

/** Moving time bounded by the spatial slice's actual activity timestamps. */
export function getActivitySliceMovingMinutes(
  slice: ActivityCourseSlice,
  stream?: Pick<ActivityDistanceTimeStream, 'elapsedSeconds' | 'moving'> | null
): number | null {
  if (typeof slice.elapsedStartSeconds !== 'number' || typeof slice.elapsedEndSeconds !== 'number') return null
  const elapsed = stream?.elapsedSeconds
  const moving = stream?.moving
  if (!elapsed || !moving || elapsed.length !== moving.length || elapsed.length < 2) return null
  const start = Math.min(slice.elapsedStartSeconds, slice.elapsedEndSeconds)
  const end = Math.max(slice.elapsedStartSeconds, slice.elapsedEndSeconds)
  let seconds = 0
  for (let index = 1; index < elapsed.length; index += 1) {
    if (!moving[index]) continue
    seconds += Math.max(0, Math.min(end, elapsed[index]) - Math.max(start, elapsed[index - 1]))
  }
  return seconds > 0 ? seconds / 60 : null
}

/**
 * Summarize a training route for comparison. Every detected overlapping segment
 * contributes to the Plan A goal; no non-overlap portion is included.
 * Segments are ordered by race course mile (when they occur during the race).
 * Race miles retain unique raw accepted coverage so GPS gaps and repeated
 * passes are not over-counted. Plan time uses the grouped continuous spans so
 * its section totals match the single entry/exit range shown to the user.
 */
export function buildTrainingPlanSummary(
  segments: OverlapSegment[],
  plan: PacePlanResult | null | undefined,
  race: Pick<Race, 'start_datetime' | 'timezone'>,
  clock24h = false,
  aidStations: OfficialAidStation[] = []
): TrainingPlanSummary | null {
  if (segments.length === 0) return null

  const grouped = selectUniqueRacePassSegments(mergeContinuousOverlapSegments(segments))
  const sectioned = splitOverlapAtAidStations(grouped, aidStations)
  const meaningfulSections = sectioned.filter(
    segment => Math.abs(segment.courseEndMi - segment.courseStartMi) >= MIN_ROUTE_PLAN_SECTION_MI
  )
  if (meaningfulSections.length === 0) return null

  const ordered = sortOverlapSegmentsByRaceMile(meaningfulSections)
  const uniqueRanges = uniqueCourseMileRanges(meaningfulSections)
  const raceMilesTotal = uniqueRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
  const trainingMilesTotal = meaningfulSections.reduce(
    (total, segment) => total + Math.abs(segment.trainingEndMi - segment.trainingStartMi),
    0
  )

  const paces = ordered.map(segment => getOverlapRacePace(plan, segment.courseStartMi, segment.courseEndMi, race, clock24h))
  const availablePaces = paces.filter((pace): pace is NonNullable<typeof pace> => pace != null)
  const raceDurationMinutes = availablePaces.length === paces.length && paces.length > 0
    ? availablePaces.reduce((total, pace) => total + pace.durationMin, 0)
    : null

  return {
    raceMilesLabel: uniqueRanges
      .map(range => `${formatMile(range.start)}–${formatMile(range.end)}`)
      .join(', '),
    raceMilesTotal,
    raceTimeLabel: availablePaces.length === paces.length
      ? availablePaces.map(pace => pace.enterTimeOfDay && pace.exitTimeOfDay ? `${pace.enterTimeOfDay}–${pace.exitTimeOfDay}` : '').filter(Boolean).join(', ') || null
      : null,
    raceDurationMinutes,
    raceDurationLabel: raceDurationMinutes != null ? formatDurationWords(raceDurationMinutes) : null,
    trainingMilesLabel: ordered
      .map(segment => `${formatMile(segment.trainingStartMi)}–${formatMile(segment.trainingEndMi)}`)
      .join(', '),
    trainingMilesTotal,
    segments: ordered.map((segment, index) => ({
      sectionLabel: aidStationSectionLabel(segment),
      courseMilesLabel: `${formatMile(segment.courseStartMi)}–${formatMile(segment.courseEndMi)}`,
      trainingMilesLabel: `${formatMile(segment.trainingStartMi)}–${formatMile(segment.trainingEndMi)}`,
      trainingStartMi: segment.trainingStartMi,
      trainingEndMi: segment.trainingEndMi,
      courseStartMi: segment.courseStartMi,
      courseEndMi: segment.courseEndMi,
      raceDurationMinutes: paces[index]?.durationMin ?? null,
      raceDurationLabel: paces[index] ? formatDurationWords(paces[index].durationMin) : null,
    })),
  }
}

/**
 * Estimate moving time for just the matched training portions. A selected
 * activity is the full imported route, so its moving time is weighted by the
 * route's overlapping miles rather than counting approach/return miles.
 */
export function getOverlappingMovingMinutes(
  movingSeconds: number,
  activityMiles: number | null,
  overlappingTrainingMiles: number
): number | null {
  if (!(movingSeconds > 0) || !(overlappingTrainingMiles > 0)) return null
  if (!activityMiles || activityMiles <= 0) return null
  return (movingSeconds / 60) * Math.min(1, overlappingTrainingMiles / activityMiles)
}

/**
 * Moving time for one matched portion of a training activity. When Strava's
 * time/distance/moving streams are available, this preserves the actual timing
 * of that part of the run (even when other matched portions are non-consecutive).
 * Older activities without streams safely fall back to a distance-weighted share
 * of Strava's moving time—never elapsed time.
 */
export function getTrainingSegmentMovingMinutes(
  movingSeconds: number,
  activityMiles: number | null,
  segment: Pick<TrainingPlanSegment, 'trainingStartMi' | 'trainingEndMi'>,
  stream?: ActivityDistanceTimeStream | null
): number | null {
  const startMi = Math.min(segment.trainingStartMi, segment.trainingEndMi)
  const endMi = Math.max(segment.trainingStartMi, segment.trainingEndMi)
  if (!(endMi > startMi)) return null

  const distance = stream?.distanceMeters
  const elapsed = stream?.elapsedSeconds
  const moving = stream?.moving
  if (distance && elapsed && moving && distance.length === elapsed.length && elapsed.length === moving.length && distance.length > 1) {
    let movingSecondsInSegment = 0
    for (let index = 1; index < distance.length; index += 1) {
      const intervalStartMi = Number(distance[index - 1]) / 1609.344
      const intervalEndMi = Number(distance[index]) / 1609.344
      const intervalMiles = intervalEndMi - intervalStartMi
      const intervalSeconds = Number(elapsed[index]) - Number(elapsed[index - 1])
      if (!moving[index] || !(intervalSeconds > 0)) continue
      if (intervalMiles === 0) {
        if (intervalStartMi >= startMi && intervalStartMi <= endMi) movingSecondsInSegment += intervalSeconds
        continue
      }
      if (!(intervalMiles > 0)) continue
      const sharedMiles = Math.max(0, Math.min(endMi, intervalEndMi) - Math.max(startMi, intervalStartMi))
      movingSecondsInSegment += intervalSeconds * (sharedMiles / intervalMiles)
    }
    return movingSecondsInSegment > 0 ? movingSecondsInSegment / 60 : null
  }

  return getOverlappingMovingMinutes(movingSeconds, activityMiles, endMi - startMi)
}

export function getTrainingAnalysisDelta(
  trainingElapsedMinutes: number,
  planGoalMinutes: number
): TrainingAnalysisDelta {
  const deltaMinutes = Math.round(trainingElapsedMinutes - planGoalMinutes)
  if (Math.abs(deltaMinutes) < 1) {
    return { deltaMinutes: 0, label: 'On Plan A time', tone: 'even' }
  }
  if (deltaMinutes < 0) {
    return {
      deltaMinutes,
      label: `${formatDurationWords(Math.abs(deltaMinutes))} faster than Plan A`,
      tone: 'faster',
    }
  }
  return {
    deltaMinutes,
    label: `${formatDurationWords(deltaMinutes)} slower than Plan A`,
    tone: 'slower',
  }
}
