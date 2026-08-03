import { describe, expect, it } from 'vitest'
import {
  computeTrainingOverlap,
  downsampleByDistance,
  formatOverlapSummary,
  parseOverlapSegments,
} from './training-overlap'

/** Build a northbound line starting at (lat0, lon0), `n` points, `stepMi` apart. */
function makeLine(lat0: number, lon0: number, n: number, stepMi: number): [number, number][] {
  // ~69 miles per degree latitude
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
    // Training = course miles ~2–5 (points 20–50)
    const training = course.slice(20, 51)
    const result = computeTrainingOverlap(training, course)
    expect(result.overlapMiles).toBeGreaterThan(2.5)
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    const seg = result.segments[0]
    expect(seg.courseStartMi).toBeGreaterThan(1.5)
    expect(seg.courseEndMi).toBeGreaterThan(seg.courseStartMi)
  })

  it('detects partial overlap', () => {
    const course = makeLine(37, -122, 80, 0.1)
    // First half on course, then veer east
    const onCourse = course.slice(10, 30)
    const offCourse = makeLine(37 + (20 * 0.1) / 69, -121.5, 20, 0.1)
    const training = [...onCourse, ...offCourse]
    const result = computeTrainingOverlap(training, course)
    expect(result.overlapMiles).toBeGreaterThan(1)
    expect(result.overlapMiles).toBeLessThan(4)
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
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
