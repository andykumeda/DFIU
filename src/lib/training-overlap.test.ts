import { describe, expect, it } from 'vitest'
import {
  buildTrainingOverlapUpdates,
  clusterMileRanges,
  computeTrainingOverlap,
  computeTrainingMapOverlap,
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
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    const courseStart = Math.min(...result.segments.map(s => s.courseStartMi))
    const courseEnd = Math.max(...result.segments.map(s => s.courseEndMi))
    expect(courseStart).toBeGreaterThan(9)
    expect(courseEnd).toBeGreaterThan(19)
    // overlap_miles = unique course span covered (~10 mi), not bridged training length
    expect(result.overlapMiles).toBeGreaterThan(8)
    expect(result.overlapMiles).toBeLessThan(12)
  })

  it('reports course-covered miles not full training length', () => {
    const course = makeLine(37, -122, 101, 0.1) // 0–10 mi
    const onCourse = course.slice(70, 101)
    const spur = makeLine(37 + 10 / 69, -121.5, 40, 0.1)
    const training = [...onCourse, ...spur]
    const result = computeTrainingOverlap(training, course)
    expect(result.segments.length).toBe(1)
    expect(result.overlapMiles).toBeGreaterThan(2.5)
    expect(result.overlapMiles).toBeLessThan(4)
    expect(result.segments[0].trainingStartMi).toBeLessThan(1)
    expect(result.segments[0].trainingEndMi).toBeLessThan(4)
  })

  it('counts unique course coverage on out-and-back (not one short leg)', () => {
    // Reverse on course miles 8→5, then forward 5→10 — unique coverage ~5 mi.
    // Same-trail reverse without a second race visit stays on one visit; unique miles still ~5.
    const course = makeLine(37, -122, 101, 0.1)
    const reverse = course.slice(50, 81).reverse() // ~8→5
    const forward = course.slice(50, 101) // ~5→10
    const training = [...reverse, ...forward]
    const result = computeTrainingOverlap(training, course)
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    expect(result.overlapMiles).toBeGreaterThan(4.5)
    expect(result.overlapMiles).toBeLessThan(6)
    const courseStart = Math.min(...result.segments.map(s => Math.min(s.courseStartMi, s.courseEndMi)))
    const courseEnd = Math.max(...result.segments.map(s => Math.max(s.courseStartMi, s.courseEndMi)))
    expect(courseStart).toBeLessThan(6)
    expect(courseEnd).toBeGreaterThan(9)
  })

  it('maps a mirrored race out-and-back as continuous course miles', () => {
    // Race goes north 0→5, then returns south as miles 5→10. Training mirrors it.
    const outbound = makeLine(37, -122, 51, 0.1)
    const ret = [...outbound].reverse()
    const course = [...outbound, ...ret.slice(1)]
    const training = [...outbound, ...ret.slice(1)]
    const result = computeTrainingOverlap(training, course)
    expect(result.overlapMiles).toBeGreaterThan(9)
    expect(result.overlapMiles).toBeLessThan(11)
    const courseStart = Math.min(...result.segments.map(s => Math.min(s.courseStartMi, s.courseEndMi)))
    const courseEnd = Math.max(...result.segments.map(s => Math.max(s.courseStartMi, s.courseEndMi)))
    expect(courseStart).toBeLessThan(1)
    expect(courseEnd).toBeGreaterThan(9)
    // Continuous race OAB may still split at the turnaround for endpoints; the
    // overall span should advance and cover the full out-and-back race miles.
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    expect(result.segments.some(s => s.courseEndMi > s.courseStartMi || s.courseStartMi < 2)).toBe(true)
  })

  it('switches race visits when training turns around on an out-and-back trail', () => {
    // Race: outbound 0→5, return 5→10 on the same trail.
    const outbound = makeLine(37, -122, 51, 0.1)
    const ret = [...outbound].reverse()
    const course = [...outbound, ...ret.slice(1)]
    // Out along the outbound visit, then reverse on the same geography — return
    // should snap to the later race visit rather than retracing miles 5→0.
    const outThenBack = [...outbound, ...outbound.slice(0, 40).reverse()]
    const result = computeTrainingOverlap(outThenBack, course)
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    const returnSeg = result.segments[result.segments.length - 1]
    expect(Math.max(returnSeg.courseStartMi, returnSeg.courseEndMi)).toBeGreaterThan(5)
  })

  it('handles empty inputs', () => {
    expect(computeTrainingOverlap([], [])).toEqual({ overlapMiles: 0, segments: [] })
    expect(computeTrainingOverlap([[0, 0]], [[1, 1], [2, 2]])).toEqual({
      overlapMiles: 0,
      segments: [],
    })
  })
})

describe('computeTrainingMapOverlap', () => {
  it('paints geometry that is visibly on the course even without persisted segments', () => {
    const course: [number, number][] = [[-118.2, 34.2], [-118.1, 34.2]]
    const training: [number, number][] = [
      [-118.2, 34.2],
      [-118.16, 34.2],
      [-118.12, 34.2],
      [-118.1, 34.2],
    ]

    const ranges = computeTrainingMapOverlap(training, course)

    expect(ranges).toHaveLength(1)
    expect(ranges[0].trainingStartMi).toBe(0)
    expect(ranges[0].trainingEndMi).toBeGreaterThan(4.5)
  })

  it('leaves an off-course connector blue between two on-course sections', () => {
    const course: [number, number][] = [
      [-118.2, 34.2],
      [-118.16, 34.2],
      [-118.12, 34.2],
    ]
    const training: [number, number][] = [
      [-118.2, 34.2],
      [-118.17, 34.2],
      [-118.15, 34.205],
      [-118.13, 34.2],
      [-118.12, 34.2],
    ]

    const ranges = computeTrainingMapOverlap(training, course, { gapBridgeMi: 0.1 })

    expect(ranges.length).toBeGreaterThanOrEqual(2)
    expect(ranges[0].trainingEndMi).toBeLessThan(ranges[1].trainingStartMi)
  })

  it('does not paint a nearby parallel trail as overlap', () => {
    const course: [number, number][] = [
      [-118.2, 34.2],
      [-118.16, 34.2],
      [-118.12, 34.2],
    ]
    // About 180 ft north of the course: close enough for broad route analysis,
    // but visibly a separate trail and therefore not map overlap.
    const training: [number, number][] = [
      [-118.2, 34.201],
      [-118.16, 34.201],
      [-118.12, 34.201],
    ]

    expect(computeTrainingMapOverlap(training, course)).toEqual([])
  })

  it('keeps painting overlap when an out-and-back return trace is closer than the current visit', () => {
    const outbound = makeLine(37, -122, 81, 0.05)
    const dLon = 0.00055
    const returnTrace = outbound.map(([lon, lat]) => [lon + dLon, lat] as [number, number]).reverse()
    const course = [...outbound, ...returnTrace.slice(1)]
    const training: [number, number][] = outbound.map((pt, i) => {
      const t = i / (outbound.length - 1)
      const drift = t > 0.35 && t < 0.65 ? dLon * 0.7 : 0
      return [pt[0] + drift, pt[1]]
    })

    const ranges = computeTrainingMapOverlap(training, course)

    expect(ranges).toHaveLength(1)
    expect(ranges[0].trainingStartMi).toBe(0)
    expect(ranges[0].trainingEndMi).toBeGreaterThan(3.5)
  })

  it('stops painting when a route turns onto a perpendicular branch', () => {
    const course: [number, number][] = [
      [-118.2, 34.2],
      [-118.16, 34.2],
      [-118.12, 34.2],
    ]
    const training: [number, number][] = [
      [-118.2, 34.2],
      [-118.18, 34.2],
      [-118.16, 34.2],
      [-118.16, 34.205],
      [-118.16, 34.21],
    ]

    const ranges = computeTrainingMapOverlap(training, course)

    expect(ranges).toHaveLength(1)
    // The matching eastbound approach is ~2.3 mi; the northbound branch adds
    // another ~0.7 mi and must stay blue.
    expect(ranges[0].trainingEndMi).toBeLessThan(2.5)
  })
})

describe('buildTrainingOverlapUpdates', () => {
  it('recomputes persisted values from route geometry instead of retaining stale overlap data', () => {
    const course = makeLine(37, -122, 101, 0.1)
    const training = course.slice(20, 81)

    const updates = buildTrainingOverlapUpdates(
      [
        {
          id: 'wilson-loop',
          geometry: { type: 'LineString', coordinates: training },
          overlap_miles: 3.65,
          overlap_segments: [
            { courseStartMi: 75.13, courseEndMi: 78.78, trainingStartMi: 0, trainingEndMi: 10.62 },
          ],
        },
      ],
      { type: 'LineString', coordinates: course }
    )

    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('wilson-loop')
    expect(updates[0].overlap_miles).toBeGreaterThan(5)
    expect(updates[0].overlap_segments[0].courseStartMi).toBeLessThan(3)
    expect(updates[0].overlap_segments[0].courseEndMi).toBeGreaterThan(7)
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

  it('includes course elevation gain when provided', () => {
    const s = formatOverlapSummary(
      4.2,
      [{ courseStartMi: 12.1, courseEndMi: 16.3, trainingStartMi: 0, trainingEndMi: 4.2 }],
      { elevationGainFt: 1234 }
    )
    expect(s).toContain('4.2 mi on course, +1,234 ft')
  })

  it('merges abutting course spans for display', () => {
    const s = formatOverlapSummary(9.9, [
      { courseStartMi: 78.8, courseEndMi: 84.9, trainingStartMi: 0, trainingEndMi: 7 },
      { courseStartMi: 74.9, courseEndMi: 78.6, trainingStartMi: 10, trainingEndMi: 14 },
    ])
    expect(s).toContain('9.9 mi on course')
    expect(s).toContain('74.9–84.9')
    expect(s).not.toContain('78.8')
  })
})

describe('courseOverlapElevationGainFt', () => {
  it('sums positive elevation within unique overlapped course miles', async () => {
    const { courseOverlapElevationGainFt } = await import('./training-overlap')
    const samples = [
      { distance: 0, elevation: 100 },
      { distance: 1, elevation: 200 },
      { distance: 2, elevation: 150 },
      { distance: 3, elevation: 250 },
      { distance: 4, elevation: 240 },
    ]
    // Unique coverage mi 1–3: +50 (200→150 ignored) then +100 (150→250) = 100
    const gain = courseOverlapElevationGainFt(samples, [
      { courseStartMi: 1, courseEndMi: 2, trainingStartMi: 0, trainingEndMi: 1 },
      { courseStartMi: 2, courseEndMi: 3, trainingStartMi: 1, trainingEndMi: 2 },
    ])
    expect(gain).toBeCloseTo(100, 4)
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

describe('point-to-point directions', () => {
  it('detects loops vs point-to-point', async () => {
    const { isPointToPointRoute, returnDirectionsUrl, directionsUrl } = await import('./training-overlap')
    expect(isPointToPointRoute(34.2, -118.16, 34.2001, -118.1601)).toBe(false)
    expect(isPointToPointRoute(34.2, -118.16, 34.3, -118.0)).toBe(true)
    expect(directionsUrl(1, 2)).toContain('destination=1,2')
    expect(returnDirectionsUrl(3, 4, 1, 2)).toContain('origin=3,4')
    expect(returnDirectionsUrl(3, 4, 1, 2)).toContain('destination=1,2')
  })
})
