import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useDemoMode } from '@/features/demo/DemoModeContext'
import { parseRunnerProfile } from './runner-profile'

type RaceRunnerProfileRow = {
  runner_profile: unknown
}

export function useRaceRunnerProfile(raceId: string, demoProfile?: unknown) {
  const queryClient = useQueryClient()
  const { isDemoMode } = useDemoMode()
  const queryKey = useMemo(() => ['race-runner-profile', raceId] as const, [raceId])

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!raceId && !isDemoMode,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('race_runner_profiles')
        .select('runner_profile')
        .eq('race_id', raceId)
        .maybeSingle()
      if (error) throw error
      return row as RaceRunnerProfileRow | null
    },
  })

  useEffect(() => {
    if (!raceId || isDemoMode) return
    const channel = supabase
      .channel(`race_runner_profiles:${raceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'race_runner_profiles', filter: `race_id=eq.${raceId}` },
        () => { void queryClient.invalidateQueries({ queryKey }) },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [isDemoMode, queryClient, queryKey, raceId])

  return {
    runnerProfile: parseRunnerProfile(isDemoMode ? demoProfile : data?.runner_profile),
    loading: !isDemoMode && isLoading,
  }
}
