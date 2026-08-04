import { describe, expect, it } from 'vitest'
import { buildDemoOverlay, mergeRaceWithOverlay, DEMO_OVERLAY_SIZE_CAP_BYTES } from '@/features/demo/demoStore'
import type { Race } from '@/types/database'

describe('demoStore helpers', () => {
  it('merges race overlay fields while preserving id', () => {
    const race = { id: 'race-1', name: 'Master', location: 'CA' } as Race
    const overlay = buildDemoOverlay({
      sourceRaceId: 'race-1',
      baseOfficialRevision: 3,
      race: { name: 'My Demo Name', location: 'NV' },
    })
    const merged = mergeRaceWithOverlay(race, overlay)
    expect(merged.id).toBe('race-1')
    expect(merged.name).toBe('My Demo Name')
    expect(merged.location).toBe('NV')
  })

  it('preserves previous overlay slices when patching one field', () => {
    const previous = buildDemoOverlay({
      sourceRaceId: 'race-1',
      baseOfficialRevision: 1,
      race: { name: 'A' },
      waypoints: [],
    })
    const next = buildDemoOverlay({
      sourceRaceId: 'race-1',
      baseOfficialRevision: 1,
      pacePlans: {
        planATimeStr: '20:00',
        planBTimeStr: '',
        planCBufferStr: '00:30',
        hasCalculated: false,
        paceChartColumns: { order: [], hidden: [], labels: {} } as never,
        paceModelSnapshot: null,
      },
      previous,
    })
    expect(next.race?.name).toBe('A')
    expect(next.waypoints).toEqual([])
    expect(next.pacePlans?.planATimeStr).toBe('20:00')
  })

  it('exposes a finite overlay size cap', () => {
    expect(DEMO_OVERLAY_SIZE_CAP_BYTES).toBeGreaterThan(100_000)
  })
})
