import React from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import type { RunnerCheckin } from '@/types/database'

// DB-backed runner check-ins per race. Read = any viewer, write = canEdit.
// Realtime so crew + runner stay in sync as actuals are logged.
export function useRunnerCheckins(raceId: string) {
    const { user } = useAuth()
    const { canEdit } = usePermission(raceId)
    const [checkins, setCheckins] = React.useState<RunnerCheckin[]>([])
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        let cancelled = false
        setLoading(true)
        ;(async () => {
            const { data } = await supabase
                .from('runner_checkins')
                .select('*')
                .eq('race_id', raceId)
                .order('arrived_at', { ascending: true })
            if (cancelled) return
            setCheckins((data as RunnerCheckin[] | null) ?? [])
            setLoading(false)
        })()
        return () => { cancelled = true }
    }, [raceId])

    React.useEffect(() => {
        const channel = supabase
            .channel(`runner_checkins:${raceId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'runner_checkins', filter: `race_id=eq.${raceId}` },
                payload => {
                    setCheckins(prev => {
                        if (payload.eventType === 'INSERT' && payload.new) {
                            const next = [...prev.filter(c => c.id !== (payload.new as RunnerCheckin).id), payload.new as RunnerCheckin]
                            return next.sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))
                        }
                        if (payload.eventType === 'UPDATE' && payload.new) {
                            return prev
                                .map(c => c.id === (payload.new as RunnerCheckin).id ? (payload.new as RunnerCheckin) : c)
                                .sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))
                        }
                        if (payload.eventType === 'DELETE' && payload.old) {
                            return prev.filter(c => c.id !== (payload.old as RunnerCheckin).id)
                        }
                        return prev
                    })
                }
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [raceId])

    const upsertCheckin = async (waypointId: string, arrivedAt: Date, notes?: string | null) => {
        if (!canEdit) throw new Error('No permission to edit')
        const row = {
            race_id: raceId,
            waypoint_id: waypointId,
            arrived_at: arrivedAt.toISOString(),
            entered_by: user?.id ?? null,
            notes: notes ?? null,
        }
        const { error } = await (supabase.from('runner_checkins') as any)
            .upsert(row, { onConflict: 'race_id,waypoint_id' })
        if (error) throw error
    }

    const deleteCheckin = async (waypointId: string) => {
        if (!canEdit) throw new Error('No permission to edit')
        const { error } = await supabase
            .from('runner_checkins')
            .delete()
            .eq('race_id', raceId)
            .eq('waypoint_id', waypointId)
        if (error) throw error
    }

    return { checkins, loading, canEdit, upsertCheckin, deleteCheckin }
}
