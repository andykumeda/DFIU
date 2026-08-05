import { describe, expect, it } from 'vitest'
import { mapLabelForWaypointGroup, stripWaypointVisitSuffix } from './waypoint-labels'

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

  it('keeps a single waypoint name unchanged', () => {
    expect(mapLabelForWaypointGroup(['Chilao 1'])).toBe('Chilao 1')
  })

  it('joins distinct bases', () => {
    expect(mapLabelForWaypointGroup(['Crew Spot', 'Aid A 1', 'Aid A 2'])).toBe('Crew Spot / Aid A')
  })
})
