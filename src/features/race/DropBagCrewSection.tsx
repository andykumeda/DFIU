import type { DropBagItem } from './drop-bag-shared'

export function DropBagCrewSection({ items, notes }: { items: DropBagItem[]; notes: string }) {
    const gear = items.filter(item => item.category === 'crew')
    return <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-300">Crew</h3>
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Crew gear</div>
        {gear.length ? <ul className="space-y-2">{gear.map(item => <li key={item.id} className="flex items-start gap-2 text-sm text-neutral-100">
            <span className={item.checked ? 'text-emerald-300' : 'text-neutral-500'} aria-hidden="true">{item.checked ? '✓' : '○'}</span>
            <span className="min-w-0 flex-1 break-words">{item.quantity?.trim() ? `${item.quantity.trim()} × ` : ''}{item.text}</span>
            <span className={`text-xs ${item.checked ? 'text-emerald-300' : 'text-neutral-500'}`}>{item.checked ? 'Packed' : 'To pack'}</span>
        </li>)}</ul> : <p className="text-sm text-neutral-500">No crew gear planned yet.</p>}
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Crew notes</div>
        <p className="whitespace-pre-wrap text-sm text-neutral-100">{notes || 'No crew notes entered.'}</p>
    </div>
}
