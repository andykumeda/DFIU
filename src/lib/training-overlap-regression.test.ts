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
  }, 15000)

  it('splits the continuous Clear Creek overlap at its official aid stations', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/clear-creek-continuous-overlap.json', import.meta.url), 'utf8')
    ) as ContinuousFixture
    const rawSegments = computeTrainingMapOverlap(fixture.training, fixture.course, {
      mergeAdjacent: false,
    })
    const mapSegments = computeTrainingMapOverlap(fixture.training, fixture.course)
    const initialMapSegments = trainingMapDisplaySegments(rawSegments)
    const continuousSummary = buildTrainingPlanSummary(
      rawSegments,
      null,
      { start_datetime: null, timezone: null },
      false
    )
    const aidStationSummary = buildTrainingPlanSummary(
      rawSegments,
      null,
      { start_datetime: null, timezone: null },
      false,
      [
        { name: 'Clear Creek', mile: 11.32, type: 'aid_station' },
        { name: 'Josephine Peak', mile: 15.34, type: 'aid_station' },
        { name: 'Redbox', mile: 24.62, type: 'aid_station' },
        { name: 'Newcomb Saddle 1', mile: 33.18, type: 'aid_station' },
        { name: 'Shortcut Saddle 1', mile: 42.61, type: 'aid_station' },
      ]
    )

    expect(rawSegments).toHaveLength(7)
    expect(initialMapSegments).toEqual(mapSegments)
    expect(mapSegments).toHaveLength(1)
    expect(continuousSummary?.segments).toHaveLength(1)
    expect(continuousSummary?.segments[0]).toMatchObject({
      courseMilesLabel: '11.3–42.6',
      trainingMilesLabel: '0.0–31.3',
    })
    expect(aidStationSummary?.segments.map(segment => segment.sectionLabel)).toEqual([
      'Clear Creek → Josephine Peak',
      'Josephine Peak → Redbox',
      'Redbox → Newcomb Saddle 1',
      'Newcomb Saddle 1 → Shortcut Saddle 1',
    ])
    expect(aidStationSummary?.segments).toHaveLength(4)
  })

  it('keeps the final approach red when start and finish reuse the same corridor', () => {
    const fixture = JSON.parse(
      // Reflected and reduced from the reported Angeles Crest route so the
      // repeated start/finish geometry is retained without storing its location.
      readFileSync(new URL('./fixtures/repeated-start-finish-overlap.json', import.meta.url), 'utf8')
    ) as ContinuousFixture

    const segments = computeTrainingMapOverlap(fixture.training, fixture.course)

    expect(segments).toHaveLength(1)
    expect(segments[0].trainingStartMi).toBeLessThan(0.1)
    expect(segments[0].trainingEndMi).toBeGreaterThan(1)
  })
})
