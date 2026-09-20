import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Race } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useDemoRacePersist } from '@/features/demo/useDemoRacePersist'
import { getRaceSupport, SUPPORT_OPTIONS, type SupportMode } from './race-support'

export function RaceSupportCard({ race, canEdit }: { race: Race; canEdit: boolean }) {
    const queryClient = useQueryClient()
    const { isDemoMode, saveRacePatch } = useDemoRacePersist(race.id)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const { mode } = getRaceSupport(race)

    async function save(next: SupportMode) {
        if (!canEdit || saving || next === mode) return
        setSaving(true)
        setMessage('Saving…')
        try {
            if (isDemoMode) {
                await saveRacePatch({ support_mode: next })
            } else {
                const { data, error } = await supabase.from('races')
                    .update({ support_mode: next }).eq('id', race.id).select('support_mode').single()
                if (error || data?.support_mode !== next) throw error || new Error('Save not confirmed')
                queryClient.setQueryData<Race>(['race', race.id], current => current ? { ...current, support_mode: data.support_mode } : current)
            }
            setMessage('Saved')
        } catch {
            setMessage('Could not save race support. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <section className='rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6' aria-labelledby='race-support-heading'>
            <h2 id='race-support-heading' className='text-xl font-bold text-white'>Race Support</h2>
            <p className='mt-1 text-sm text-neutral-400'>Who will support you at this event?</p>
            <div className='mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3' role='group' aria-label='Race support'>
                {SUPPORT_OPTIONS.map(option => (
                    <button key={option.value} type='button' aria-pressed={mode === option.value}
                        disabled={!canEdit || saving} onClick={() => void save(option.value)}
                        className={`rounded-lg border p-3 text-left disabled:cursor-default ${mode === option.value ? 'border-orange-500 bg-orange-950/40 text-white' : 'border-neutral-700 bg-neutral-950/40 text-neutral-300 hover:border-neutral-500'}`}>
                        <span className='block font-semibold'>{option.label}</span>
                        <span className='mt-1 block text-xs text-neutral-400'>{option.description}</span>
                    </button>
                ))}
            </div>
            <p className='mt-3 text-xs text-neutral-400'>Crew and Pacer tabs follow this choice. Crew bags appear only when using crew. Existing notes and assignments are kept.</p>
            <p className='mt-2 text-sm text-neutral-300' role='status' aria-live='polite'>{message || (!canEdit ? 'Only the plan owner or an editor can change race support.' : '')}</p>
        </section>
    )
}
