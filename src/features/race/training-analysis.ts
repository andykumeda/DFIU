import type { Race } from '@/types/database'
import {
  uniqueCourseMileRanges,
  uniqueCourseMiles,
  type OverlapSegment,
} from '@/lib/training-overlap'

export { uniqueCourseMileRanges, uniqueCourseMiles }
import type { PacePlanResult } from './pace-utils'
import { getOverlapRacePace } from './race-day-utils'

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
  courseMilesLabel: string
  trainingMilesLabel: string
  trainingStartMi: number
  trainingEndMi: number
  raceDurationMinutes: number | null
  raceDurationLabel: string | null
}

export interface ActivityDistanceTimeStream {
  distanceMeters: number[]
  elapsedSeconds: number[]
  moving: boolean[]
}

export interface TrainingAnalysisDelta {
  deltaMinutes: number
  label: string
  tone: 'faster' | 'slower' | 'even'
}

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

/**
 * Summarize a training route for comparison. Every detected overlapping segment
 * contributes to the Plan A goal; no non-overlap portion is included.
 * Segments are ordered by race course mile (when they occur during the race).
 * Race segment miles/time use unique course coverage so reverse+forward on the
 * same stretch is not double-counted (matches “mi on course”).
 */
export function buildTrainingPlanSummary(
  segments: OverlapSegment[],
  plan: PacePlanResult | null | undefined,
  race: Pick<Race, 'start_datetime' | 'timezone'>,
  clock24h = false
): TrainingPlanSummary | null {
  if (segments.length === 0) return null

  const ordered = sortOverlapSegmentsByRaceMile(segments)
  const uniqueRanges = uniqueCourseMileRanges(ordered)
  const raceMilesTotal = uniqueRanges.reduce((sum, r) => sum + (r.end - r.start), 0)
  const trainingMilesTotal = ordered.reduce(
    (total, segment) => total + Math.abs(segment.trainingEndMi - segment.trainingStartMi),
    0
  )

  const uniquePaces = uniqueRanges.map(range =>
    getOverlapRacePace(plan, range.start, range.end, race, clock24h)
  )
  const availableUniquePaces = uniquePaces.filter((pace): pace is NonNullable<typeof pace> => pace != null)
  const raceDurationMinutes = availableUniquePaces.length === uniqueRanges.length && uniqueRanges.length > 0
    ? availableUniquePaces.reduce((total, pace) => total + pace.durationMin, 0)
    : null

  const paces = ordered.map(segment => getOverlapRacePace(plan, segment.courseStartMi, segment.courseEndMi, race, clock24h))

  return {
    raceMilesLabel: uniqueRanges
      .map(range => `${formatMile(range.start)}–${formatMile(range.end)}`)
      .join(', '),
    raceMilesTotal,
    raceTimeLabel: availableUniquePaces.length === uniqueRanges.length
      ? availableUniquePaces.map(pace => pace.enterTimeOfDay && pace.exitTimeOfDay ? `${pace.enterTimeOfDay}–${pace.exitTimeOfDay}` : '').filter(Boolean).join(', ') || null
      : null,
    raceDurationMinutes,
    raceDurationLabel: raceDurationMinutes != null ? formatDurationWords(raceDurationMinutes) : null,
    trainingMilesLabel: ordered
      .map(segment => `${formatMile(segment.trainingStartMi)}–${formatMile(segment.trainingEndMi)}`)
      .join(', '),
    trainingMilesTotal,
    segments: ordered.map((segment, index) => ({
      courseMilesLabel: `${formatMile(segment.courseStartMi)}–${formatMile(segment.courseEndMi)}`,
      trainingMilesLabel: `${formatMile(segment.trainingStartMi)}–${formatMile(segment.trainingEndMi)}`,
      trainingStartMi: segment.trainingStartMi,
      trainingEndMi: segment.trainingEndMi,
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
      if (!moving[index] || !(intervalMiles > 0) || !(intervalSeconds > 0)) continue
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
