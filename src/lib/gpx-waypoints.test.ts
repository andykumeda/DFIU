import { describe, expect, it } from 'vitest'
import { parseGpxWaypoints } from './gpx-parser'

describe('parseGpxWaypoints', () => {
  it('preserves named start, finish, and water points from an imported route', () => {
    const gpx = `<?xml version="1.0"?>
      <gpx xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="34.2701848219" lon="-118.1534328137"><name>Start</name></wpt>
        <wpt lat="34.2734856949" lon="-118.0332319281"><name>Finish</name></wpt>
        <wpt lat="34.2451951908" lon="-118.0495788015"><name>Water &amp; shade</name></wpt>
      </gpx>`

    expect(parseGpxWaypoints(gpx)).toEqual([
      { name: 'Start', lat: 34.2701848219, lon: -118.1534328137 },
      { name: 'Finish', lat: 34.2734856949, lon: -118.0332319281 },
      { name: 'Water & shade', lat: 34.2451951908, lon: -118.0495788015 },
    ])
  })
})
