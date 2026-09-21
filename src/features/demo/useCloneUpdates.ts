import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import { recomputeTrainingOverlapsForRace } from '@/features/race/useTrainingRoutes'
import {
  applyResourcesConfigOps,
  partitionOfficialUpdateSelection,
  type OfficialUpdateSection,
  type OfficialUpdateSectionId,
} from './official-update-diff'
import type { Json, Race } from '@/types/database'

export type CloneUpdateStatus = {
  has_updates: boolean
  source_revision: number | null
  merged_revision: number | null
  source_updated_at: string | null
}

export function useCloneUpdateStatus(raceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['clone-update-status', raceId],
    enabled: !!raceId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<CloneUpdateStatus> => {
      const { data, error } = await supabase.rpc('get_clone_update_status', {
        p_race_id: raceId!,
      })
      if (error) throw error
      const row = (data ?? {}) as Partial<CloneUpdateStatus>
      return {
        has_updates: !!row.has_updates,
        source_revision: row.source_revision ?? null,
        merged_revision: row.merged_revision ?? null,
        source_updated_at: row.source_updated_at ?? null,
      }
    },
  })
}

export function useOfficialUpdateActions(raceId: string) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { canEdit } = usePermission(raceId)

  const applySelected = async (changeIds: string[], sections: OfficialUpdateSection[], currentRace: Race) => {
    if (!user || !canEdit) throw new Error('Not authorized')
    const { raceFields, resourceOps, rpcSections, resourcesFullReplace } = partitionOfficialUpdateSelection(sections, changeIds)

    const patch: Record<string, unknown> = { ...raceFields }
    if (resourcesFullReplace) {
      // Full resources replace goes through the RPC section sync.
    } else if (resourceOps.length) {
      patch.resources_config = applyResourcesConfigOps(currentRace.resources_config, resourceOps) as Json
    }

    if (Object.keys(patch).length) {
      const { error: patchError } = await supabase.from('races').update(patch).eq('id', raceId)
      if (patchError) throw patchError
    }

    const sectionsForRpc: OfficialUpdateSectionId[] = resourcesFullReplace
      ? rpcSections
      : rpcSections.filter((section: OfficialUpdateSectionId) => section !== 'resources')

    const { error } = await supabase.rpc('sync_selected_official_updates', {
      p_clone_race_id: raceId,
      p_sections: sectionsForRpc,
    })
    if (error) throw error
    const { data: refreshedCourse, error: courseError } = await supabase
      .from('courses')
      .select('geometry')
      .eq('race_id', raceId)
      .maybeSingle()
    if (courseError) throw courseError
    if (sectionsForRpc.includes('course') && refreshedCourse?.geometry) {
      await recomputeTrainingOverlapsForRace(raceId, refreshedCourse.geometry)
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['race', raceId] }),
      queryClient.invalidateQueries({ queryKey: ['course', raceId] }),
      queryClient.invalidateQueries({ queryKey: ['waypoints'] }),
      queryClient.invalidateQueries({ queryKey: ['clone-update-status', raceId] }),
      queryClient.invalidateQueries({ queryKey: ['official-update-review', raceId] }),
    ])
  }
  return { applySelected }
}
