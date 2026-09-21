import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import type { Waypoint } from '@/types/database'
import type { DropBagItem } from './drop-bag-shared'
import type { DropBagCoverageRow } from './DropBagModal'
import { DropBagCoverage } from './DropBagCoverage'

export function DropBagPrintPage({ waypoint, raceName, bagName, notes, items, arrival, cutoff, coverageRows, onClose }: {
    waypoint: Waypoint; raceName: string; bagName: string; notes: string; items: DropBagItem[];
    arrival?: string; cutoff?: string | null; coverageRows: DropBagCoverageRow[]; onClose: () => void
}) {
    const packed = items.filter(item => item.checked)
    return createPortal(<div className="single-bag-print-overlay fixed inset-0 z-[210] overflow-y-auto bg-black/80 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Printable drop bag">
        <div className="print:hidden mx-auto mb-3 flex max-w-3xl justify-end gap-3">
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white"><Printer className="h-4 w-4" />Print</button>
            <button onClick={onClose} className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-white"><X className="h-4 w-4" />Back</button>
        </div>
        <article className="single-bag-print-page mx-auto flex min-h-[9in] max-w-3xl flex-col bg-white p-6 text-black sm:p-12">
            <div className="border-b-4 border-black pb-6">
                <p className="text-sm">{raceName} · Drop Bag</p>
                <h1 className="mt-3 break-words text-4xl font-black leading-tight sm:text-5xl">{bagName || waypoint.name}</h1>
                {bagName && <h2 className="mt-2 break-words text-3xl font-bold">{waypoint.name}</h2>}
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-lg font-semibold">
                    <span>Mile {waypoint.mile.toFixed(1)}</span>
                    {arrival && <span>Plan A arrival {arrival}</span>}
                    {cutoff && <span>Cutoff {cutoff}</span>}
                </div>
            </div>
            <section className="py-7">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">Inside this bag</h2>
                {packed.length ? <ul className="list-disc space-y-3 pl-6 text-xl">
                    {packed.map(item => <li key={item.id} className="break-words">{item.quantity?.trim() && `${item.quantity} × `}{item.text}</li>)}
                </ul> : <p>No packed items yet.</p>}
            </section>
            <div className="mt-auto space-y-5 border-t-2 border-black pt-5">
                {[['Notes', notes], ['Tell runner', waypoint.crew_relay_notes], ['Next leg reminder', waypoint.runner_next_leg_notes]].map(([label, text]) => text && <section key={label}>
                    <h2 className="text-sm font-bold uppercase tracking-wide">{label}</h2>
                    <p className="mt-1 whitespace-pre-wrap break-words">{text}</p>
                </section>)}
                <DropBagCoverage rows={coverageRows} print />
            </div>
        </article>
    </div>, document.body)
}
