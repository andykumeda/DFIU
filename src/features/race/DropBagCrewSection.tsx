import type { Waypoint } from '@/types/database'
import { DropBagSummary } from './DropBagSummary'

export function DropBagCrewSection({ waypoint, notes }: { waypoint: Waypoint; notes: string }) {
    return <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-300">Crew</h3>
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Crew gear</div>
        <DropBagSummary waypoint={waypoint} crew />
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Crew notes</div>
        <p className="whitespace-pre-wrap text-sm text-neutral-100">{notes || 'No crew notes entered.'}</p>
    </div>
}
