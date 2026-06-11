import type { Waypoint } from '@/types/database'

/**
 * Read-only "what's inside the bag" list. Shows packed items (the `checked`
 * flag means packed). Used by Crew View and the contents-only drop bag popup.
 */
export function DropBagSummary({ waypoint }: { waypoint: Waypoint }) {
    const allItems = (waypoint.drop_bag_items as Array<{ text?: string; label?: string; name?: string; qty?: number; quantity?: number | string; checked?: boolean }> | null) ?? []
    const items = allItems.filter(it => it.checked)
    if (!items.length) return <div className='text-sm text-neutral-400'>No packed items yet.</div>
    return (
        <ul className='space-y-1'>
            {items.map((it, i) => {
                const label = it.text || it.label || it.name || 'Item'
                const qty = it.quantity ?? it.qty
                const hasQty = qty != null && String(qty).trim() !== ''
                return (
                    <li key={i} className='flex items-center gap-2 text-sm text-neutral-100'>
                        <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0' />
                        <span className='flex-1'>{label}</span>
                        {hasQty && <span className='text-neutral-400 text-xs'>×{qty}</span>}
                    </li>
                )
            })}
        </ul>
    )
}
