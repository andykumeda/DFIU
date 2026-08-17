import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeTrainingOverlap, uniqueCourseMiles } from './training-overlap'

type Fixture = {
  course: [number, number][]
  proposed: [number, number][]
  completed: [number, number][]
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
})
