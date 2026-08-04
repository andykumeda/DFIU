import { useQueryClient } from '@tanstack/react-query'
import type { Race, Waypoint, TerrainNode } from '@/types/database'
import type { PacePlans } from '@/features/race/usePacePlans'
import { useDemoMode } from './DemoModeContext'
import { buildDemoOverlay } from './demoStore'

/** Persist demo overlay patches and keep react-query caches in sync. */
export function useDemoRacePersist(raceId: string) {
  const queryClient = useQueryClient()
  const { isDemoMode, overlay, persistOverlay } = useDemoMode()

  const saveRacePatch = async (patch: Partial<Race>) => {
    if (!isDemoMode) return false
    const current = queryClient.getQueryData<Race>(['race', raceId])
    const nextRace = { ...(current ?? {}), ...patch, id: raceId } as Race
    queryClient.setQueryData(['race', raceId], nextRace)
    const next = buildDemoOverlay({
      sourceRaceId: raceId,
      baseOfficialRevision: nextRace.official_revision ?? overlay?.baseOfficialRevision ?? null,
      race: { ...overlay?.race, ...patch },
      previous: overlay,
    })
    await persistOverlay(next)
    return true
  }

  const saveWaypoints = async (courseId: string, waypoints: Waypoint[]) => {
    if (!isDemoMode) return false
    queryClient.setQueryData(['waypoints', courseId], waypoints)
    const race = queryClient.getQueryData<Race>(['race', raceId])
    const next = buildDemoOverlay({
      sourceRaceId: raceId,
      baseOfficialRevision: race?.official_revision ?? overlay?.baseOfficialRevision ?? null,
      waypoints,
      previous: overlay,
    })
    await persistOverlay(next)
    return true
  }

  const saveTerrain = async (terrainNodes: TerrainNode[]) => {
    if (!isDemoMode) return false
    const race = queryClient.getQueryData<Race>(['race', raceId])
    const next = buildDemoOverlay({
      sourceRaceId: raceId,
      baseOfficialRevision: race?.official_revision ?? overlay?.baseOfficialRevision ?? null,
      terrainNodes,
      previous: overlay,
    })
    await persistOverlay(next)
    return true
  }

  const savePacePlans = async (pacePlans: PacePlans) => {
    if (!isDemoMode) return false
    const race = queryClient.getQueryData<Race>(['race', raceId])
    const next = buildDemoOverlay({
      sourceRaceId: raceId,
      baseOfficialRevision: race?.official_revision ?? overlay?.baseOfficialRevision ?? null,
      pacePlans,
      previous: overlay,
    })
    await persistOverlay(next)
    return true
  }

  return { isDemoMode, saveRacePatch, saveWaypoints, saveTerrain, savePacePlans }
}
