import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'

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

  const merge = async () => {
    if (!user || !canEdit) throw new Error('Not authorized')
    const { error } = await supabase.rpc('sync_official_race_to_clone', {
      p_clone_race_id: raceId,
    })
    if (error) throw error
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['race', raceId] }),
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
      queryClient.invalidateQueries({ queryKey: ['waypoints'] }),
      queryClient.invalidateQueries({ queryKey: ['clone-update-status', raceId] }),
    ])
  }

  const dismiss = async () => {
    if (!user || !canEdit) throw new Error('Not authorized')
    const { error } = await supabase.rpc('dismiss_clone_official_update', {
      p_race_id: raceId,
    })
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: ['clone-update-status', raceId] })
  }

  return { merge, dismiss }
}
