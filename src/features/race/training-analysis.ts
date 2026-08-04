import type { Race } from '@/types/database'
import type { OverlapSegment } from '@/lib/training-overlap'
import type { PacePlanResult } from './pace-utils'
import { getOverlapRacePace } from './race-day-utils'

export interface TrainingPlanSummary {
  primarySegment: OverlapSegment
  raceMilesLabel: string
  raceMilesTotal: number
  raceTimeLabel: string | null
  raceDurationMinutes: number | null
  raceDurationLabel: string | null
  trainingMilesLabel: string
  trainingMilesTotal: number
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

/**
 * Summarize a training route for comparison. The longest continuous race segment
 * provides the Plan A time goal; all on-course training ranges remain visible.
 */
export function buildTrainingPlanSummary(
  segments: OverlapSegment[],
  plan: PacePlanResult | null | undefined,
  race: Pick<Race, 'start_datetime' | 'timezone'>,
  clock24h = false
): TrainingPlanSummary | null {
  if (segments.length === 0) return null

  const primarySegment = segments.reduce((best, segment) => {
    const bestSpan = Math.abs(best.courseEndMi - best.courseStartMi)
    const segmentSpan = Math.abs(segment.courseEndMi - segment.courseStartMi)
    return segmentSpan > bestSpan ? segment : best
  })
  const raceMilesTotal = Math.abs(primarySegment.courseEndMi - primarySegment.courseStartMi)
  const trainingMilesTotal = segments.reduce(
    (total, segment) => total + Math.abs(segment.trainingEndMi - segment.trainingStartMi),
    0
  )
  const pace = getOverlapRacePace(
    plan,
    primarySegment.courseStartMi,
    primarySegment.courseEndMi,
    race,
    clock24h
  )

  return {
    primarySegment,
    raceMilesLabel: `${formatMile(primarySegment.courseStartMi)}–${formatMile(primarySegment.courseEndMi)}`,
    raceMilesTotal,
    raceTimeLabel:
      pace?.enterTimeOfDay && pace.exitTimeOfDay
        ? `${pace.enterTimeOfDay}–${pace.exitTimeOfDay}`
        : null,
    raceDurationMinutes: pace?.durationMin ?? null,
    raceDurationLabel: pace ? formatDurationWords(pace.durationMin) : null,
    trainingMilesLabel: segments
      .map(segment => `${formatMile(segment.trainingStartMi)}–${formatMile(segment.trainingEndMi)}`)
      .join(', '),
    trainingMilesTotal,
  }
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
