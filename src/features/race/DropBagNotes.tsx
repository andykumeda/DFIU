import { Waypoint } from '@/types/database'
import { getDropBagNotes } from './drop-bag-shared'

interface DropBagNotesProps {
    waypoint: Waypoint
    className?: string
    showEmpty?: boolean
    /** When false, only map-sourced notes (crew relay / next leg) are shown. */
    showDropBagNotes?: boolean
}

export function DropBagNotes({
    waypoint,
    className = '',
    showEmpty = false,
    showDropBagNotes = true,
}: DropBagNotesProps) {
    const dropBagNotes = showDropBagNotes ? getDropBagNotes(waypoint) : ''
    const hasNotes = !!(
        dropBagNotes ||
        waypoint.crew_relay_notes ||
        waypoint.runner_next_leg_notes
    )
    if (!hasNotes && !showEmpty) return null

    return (
        <div className={`space-y-2 ${className}`}>
            {showDropBagNotes && (
                dropBagNotes ? (
                    <div className='bg-neutral-800 rounded p-2 text-sm whitespace-pre-wrap'>
                        <div className='text-xs text-neutral-400 mb-1'>Drop bag notes</div>
                        {dropBagNotes}
                    </div>
                ) : showEmpty ? (
                    <div className='bg-neutral-800 rounded p-2 text-sm text-neutral-500'>
                        <div className='text-xs text-neutral-400 mb-1'>Drop bag notes</div>
                        No notes recorded.
                    </div>
                ) : null
            )}
            {waypoint.crew_relay_notes && (
                <div className='bg-blue-950/50 border border-blue-900/60 rounded p-2 text-sm whitespace-pre-wrap'>
                    <div className='text-xs text-blue-300 mb-1'>Tell runner</div>
                    {waypoint.crew_relay_notes}
                </div>
            )}
            {waypoint.runner_next_leg_notes && (
                <div className='bg-amber-950/40 border border-amber-900/60 rounded p-2 text-sm whitespace-pre-wrap'>
                    <div className='text-xs text-amber-300 mb-1'>Next leg reminder</div>
                    {waypoint.runner_next_leg_notes}
                </div>
            )}
        </div>
    )
}
