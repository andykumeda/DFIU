import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTrainingPlanSummary } from '@/features/race/training-analysis'
import { trainingMapDisplaySegments } from '@/features/race/training-map-segments'
import { computeTrainingMapOverlap, computeTrainingOverlap, uniqueCourseMiles } from './training-overlap'

type Fixture = {
  course: [number, number][]
  proposed: [number, number][]
  completed: [number, number][]
}

type ContinuousFixture = {
  course: [number, number][]
  training: [number, number][]
}

describe('reported training overlap regression', () => {
  it('counts only accepted course spans for the proposed and completed routes', () => {
    const fixture = JSON.parse(
      // The real route shapes are downsampled and geographically translated so
      // the regression preserves the failure without storing an activity location.
      readFileSync(new URL('./fixtures/training-overlap-rejected-candidates.json', import.meta.url), 'utf8')
    ) as Fixture
    const proposed = computeTrainingOverlap(fixture.proposed, fixture.course)
    const completed = computeTrainingOverlap(fixture.completed, fixture.course)
    expect(proposed.segments).toHaveLength(4)
    expect(completed.segments).toHaveLength(4)
    expect(proposed.overlapMiles).toBeCloseTo(uniqueCourseMiles(proposed.segments), 2)
    expect(completed.overlapMiles).toBeCloseTo(uniqueCourseMiles(completed.segments), 2)
    expect(proposed.overlapMiles).toBeCloseTo(12.8, 2)
    expect(completed.overlapMiles).toBeCloseTo(12.78, 2)
  })

  it('reports one analytical section when the map paints one continuous overlap', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/clear-creek-continuous-overlap.json', import.meta.url), 'utf8')
    ) as ContinuousFixture
    const rawSegments = computeTrainingMapOverlap(fixture.training, fixture.course, {
      mergeAdjacent: false,
    })
    const mapSegments = computeTrainingMapOverlap(fixture.training, fixture.course)
    const initialMapSegments = trainingMapDisplaySegments(rawSegments)
    const summary = buildTrainingPlanSummary(
      rawSegments,
      null,
      { start_datetime: null, timezone: null },
      false
    )

    expect(rawSegments).toHaveLength(7)
    expect(initialMapSegments).toEqual(mapSegments)
    expect(mapSegments).toHaveLength(1)
    expect(summary?.segments).toHaveLength(1)
    expect(summary?.segments[0]).toMatchObject({
      courseMilesLabel: '11.3–42.6',
      trainingMilesLabel: '0.0–31.3',
    })
  })
})
