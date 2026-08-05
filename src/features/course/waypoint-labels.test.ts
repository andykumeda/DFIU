import { describe, expect, it } from 'vitest'
import {
  groupWaypointsByProximity,
  mapLabelForWaypointGroup,
  MAP_WAYPOINT_STACK_RADIUS_MI,
  stripWaypointVisitSuffix,
} from './waypoint-labels'

describe('stripWaypointVisitSuffix', () => {
  it('strips trailing visit numbers and mile tags', () => {
    expect(stripWaypointVisitSuffix('Shortcut Saddle 1')).toBe('Shortcut Saddle')
    expect(stripWaypointVisitSuffix('Shortcut Saddle 2')).toBe('Shortcut Saddle')
    expect(stripWaypointVisitSuffix('Chilao #1')).toBe('Chilao')
    expect(stripWaypointVisitSuffix('Newcomb (2)')).toBe('Newcomb')
    expect(stripWaypointVisitSuffix('Shortcut Saddle (mi 42)')).toBe('Shortcut Saddle')
  })

  it('keeps names that are only a number-like token', () => {
    expect(stripWaypointVisitSuffix('12')).toBe('12')
  })
})

describe('mapLabelForWaypointGroup', () => {
  it('collapses visit suffixes to one map label', () => {
    expect(mapLabelForWaypointGroup(['Shortcut Saddle 1', 'Shortcut Saddle 2'])).toBe('Shortcut Saddle')
  })

  it('strips a lone visit suffix so near-miss stacks still read cleanly', () => {
    expect(mapLabelForWaypointGroup(['Chilao 1'])).toBe('Chilao')
  })

  it('joins distinct bases', () => {
    expect(mapLabelForWaypointGroup(['Crew Spot', 'Aid A 1', 'Aid A 2'])).toBe('Crew Spot / Aid A')
  })
})

describe('groupWaypointsByProximity', () => {
  it('stacks AC100-style out-and-back snaps that the old degree epsilon missed', () => {
    // Real Shortcut Saddle / Chilao deltas from production (~50 m / ~15 m).
    const waypoints = [
      { id: 'ss1', name: 'Shortcut Saddle 1', lat: 34.273579623932335, lon: -118.03219654126822 },
      { id: 'ss2', name: 'Shortcut Saddle 2', lat: 34.27352433038789, lon: -118.03265977673976 },
      { id: 'c1', name: 'Chilao 1', lat: 34.3274158178684, lon: -118.00809382207854 },
      { id: 'c2', name: 'Chilao 2', lat: 34.32730569395505, lon: -118.00814798738375 },
      { id: 'n1', name: 'Newcomb Saddle 1', lat: 34.235906250047044, lon: -118.02008031251917 },
      { id: 'n2', name: 'Newcomb Saddle 2', lat: 34.235920511325446, lon: -118.02005780899243 },
    ]
    const groups = groupWaypointsByProximity(waypoints, MAP_WAYPOINT_STACK_RADIUS_MI)
    expect(groups).toHaveLength(3)
    expect(groups.map(g => g.map(w => w.name).sort())).toEqual([
      ['Shortcut Saddle 1', 'Shortcut Saddle 2'].sort(),
      ['Chilao 1', 'Chilao 2'].sort(),
      ['Newcomb Saddle 1', 'Newcomb Saddle 2'].sort(),
    ])
  })
})
