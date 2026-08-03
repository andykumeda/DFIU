import { describe, expect, it } from 'vitest'
import {
  clusterMileRanges,
  computeTrainingOverlap,
  downsampleByDistance,
  formatOverlapSummary,
  nameFromGpxFileName,
  parseOverlapSegments,
} from './training-overlap'

/** Build a northbound line starting at (lat0, lon0), `n` points, `stepMi` apart. */
function makeLine(lat0: number, lon0: number, n: number, stepMi: number): [number, number][] {
  const dLat = stepMi / 69
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    out.push([lon0, lat0 + i * dLat])
  }
  return out
}

describe('downsampleByDistance', () => {
  it('keeps first and last and spaces samples', () => {
    const line = makeLine(37, -122, 20, 0.02)
    const { coords, miles } = downsampleByDistance(line, 0.05)
    expect(coords[0]).toEqual(line[0])
    expect(coords[coords.length - 1]).toEqual(line[line.length - 1])
    expect(coords.length).toBeLessThan(line.length)
    expect(miles[0]).toBe(0)
    expect(miles[miles.length - 1]).toBeGreaterThan(0.3)
  })
})

describe('clusterMileRanges', () => {
  it('merges nearby miles into one range', () => {
    const ranges = clusterMileRanges([90.5, 91, 92, 92.5, 93.2, 100.8, 50, 50.2], 1.25)
    expect(ranges).toEqual([
      { start: 50, end: 50.2 },
      { start: 90.5, end: 93.2 },
      { start: 100.8, end: 100.8 },
    ])
  })
})

describe('computeTrainingOverlap', () => {
  it('returns no overlap when routes are far apart', () => {
    const course = makeLine(37, -122, 50, 0.1)
    const training = makeLine(38, -121, 30, 0.1)
    const result = computeTrainingOverlap(training, course)
    expect(result.overlapMiles).toBe(0)
    expect(result.segments).toHaveLength(0)
  })

  it('detects full overlap when training matches a course segment', () => {
    const course = makeLine(37, -122, 100, 0.1)
    const training = course.slice(20, 51)
    const result = computeTrainingOverlap(training, course)
    expect(result.overlapMiles).toBeGreaterThan(2.5)
    expect(result.segments.length).toBe(1)
    const seg = result.segments[0]
    expect(seg.courseStartMi).toBeGreaterThan(1.5)
    expect(seg.courseEndMi).toBeGreaterThan(seg.courseStartMi)
  })

  it('detects partial overlap', () => {
    const course = makeLine(37, -122, 80, 0.1)
    const onCourse = course.slice(10, 30)
    const offCourse = makeLine(37 + (20 * 0.1) / 69, -121.5, 20, 0.1)
    const training = [...onCourse, ...offCourse]
    const result = computeTrainingOverlap(training, course)
    expect(result.overlapMiles).toBeGreaterThan(1)
    expect(result.overlapMiles).toBeLessThan(4)
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
  })

  it('bridges brief GPS dropouts and merges course miles into one range', () => {
    // Course: 0–20 mi. Training follows miles 10–20 with a short off-course blip.
    const course = makeLine(37, -122, 201, 0.1)
    const onA = course.slice(100, 130) // ~mi 10–13
    const blip = makeLine(37 + 13 / 69, -121.7, 3, 0.05) // brief detour
    const onB = course.slice(135, 201) // ~mi 13.5–20
    const training = [...onA, ...blip, ...onB]
    const result = computeTrainingOverlap(training, course)
    expect(result.segments.length).toBe(1)
    expect(result.segments[0].courseStartMi).toBeGreaterThan(9)
    expect(result.segments[0].courseEndMi).toBeGreaterThan(19)
    expect(result.overlapMiles).toBeGreaterThan(8)
  })

  it('handles empty inputs', () => {
    expect(computeTrainingOverlap([], [])).toEqual({ overlapMiles: 0, segments: [] })
    expect(computeTrainingOverlap([[0, 0]], [[1, 1], [2, 2]])).toEqual({
      overlapMiles: 0,
      segments: [],
    })
  })
})

describe('formatOverlapSummary', () => {
  it('formats no overlap', () => {
    expect(formatOverlapSummary(0, [])).toBe('No overlap with race course')
  })

  it('formats with ranges', () => {
    const s = formatOverlapSummary(4.2, [
      { courseStartMi: 12.1, courseEndMi: 16.3, trainingStartMi: 0, trainingEndMi: 4.2 },
    ])
    expect(s).toContain('4.2 mi on course')
    expect(s).toContain('12.1–16.3')
  })
})

describe('parseOverlapSegments', () => {
  it('parses valid segments and skips junk', () => {
    const segs = parseOverlapSegments([
      { courseStartMi: 1, courseEndMi: 2, trainingStartMi: 0, trainingEndMi: 1 },
      { courseStartMi: 'x' },
      null,
    ])
    expect(segs).toHaveLength(1)
    expect(segs[0].courseStartMi).toBe(1)
  })
})

describe('filterStartFinishCollisionRanges', () => {
  it('drops small start cluster when finish is colocated and late range exists', async () => {
    const { filterStartFinishCollisionRanges } = await import('./training-overlap')
    const course: [number, number][] = [
      [-122, 37],
      [-122, 37.1],
      [-122, 37.2],
      [-122, 37],
    ]
    const ranges = filterStartFinishCollisionRanges(
      [
        { start: 0.1, end: 1.4 },
        { start: 90.4, end: 100.8 },
      ],
      course,
      100.8
    )
    expect(ranges).toEqual([{ start: 90.4, end: 100.8 }])
  })
})

describe('nameFromGpxFileName', () => {
  it('strips path and extension', () => {
    expect(nameFromGpxFileName('Angeles Crest Finish.gpx')).toBe('Angeles Crest Finish')
    expect(nameFromGpxFileName('/tmp/foo/bar.GPX')).toBe('bar')
  })
})
