import type { DropBagCoverageRow } from './DropBagModal'

export function DropBagCoverage({ rows, print = false }: { rows: DropBagCoverageRow[]; print?: boolean }) {
    return <div className="space-y-3">
        {rows.map(row => <div key={row.label} className="text-sm">
            <div className={`text-xs font-bold uppercase tracking-wide ${print ? '' : row.labelClass}`}>{row.label}</div>
            {row.targetName ? <>
                <div className={`font-semibold break-words ${print ? '' : 'text-neutral-200'}`}>{row.targetName}</div>
                <div className={`flex flex-wrap gap-x-3 gap-y-1 ${print ? '' : 'text-neutral-400'}`}>
                    <span className="font-mono">Mile {row.targetMile?.toFixed(1)} · +{row.milesUntil?.toFixed(1)} mi</span>
                    {row.plans.map(plan => plan.timeOfDay && <span key={plan.label}>Arrival <span className="font-mono">{plan.timeOfDay}</span>{plan.duration && ` · in ${plan.duration}`}</span>)}
                    {row.cutoff && <span>Cutoff <span className="font-mono font-semibold">{row.cutoff}</span></span>}
                </div>
            </> : <div className={print ? '' : 'text-neutral-400'}>None ahead</div>}
        </div>)}
    </div>
}
