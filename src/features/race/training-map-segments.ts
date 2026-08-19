import { mergeContinuousOverlapSegments } from '@/lib/training-overlap'

export interface TrainingMapDisplaySegment {
  trainingStartMi: number
  trainingEndMi: number
  courseStartMi?: number
  courseEndMi?: number
}

/**
 * Normalize raw matcher fragments before the detail map's first paint.
 * Statistics still use the raw segments; this projection is display-only.
 */
export function trainingMapDisplaySegments(
  segments: TrainingMapDisplaySegment[] | undefined
): TrainingMapDisplaySegment[] {
  if (!segments?.length) return []
  const complete = segments.every(
    segment => Number.isFinite(segment.courseStartMi) && Number.isFinite(segment.courseEndMi)
  )
  if (!complete) return [...segments]
  return mergeContinuousOverlapSegments(
    segments as Array<Required<TrainingMapDisplaySegment>>
  )
}
