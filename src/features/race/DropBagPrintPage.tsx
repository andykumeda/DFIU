import { Markdown } from '@/components/Markdown'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import type { Waypoint } from '@/types/database'
import { CREW_NOTES_FIELD_ID, type DropBagItem } from './drop-bag-shared'
import type { DropBagTextFieldValue } from './drop-bag-shared'
import type { DropBagCoverageRow } from './DropBagModal'
import { DropBagCoverage } from './DropBagCoverage'

export function DropBagPrintPage({ waypoint, raceName, bagName, notes, items, textFields, arrival, cutoff, coverageRows, onClose }: {
    waypoint: Waypoint; raceName: string; bagName: string; notes: string; items: DropBagItem[]; textFields: DropBagTextFieldValue[];
    arrival?: string; cutoff?: string | null; coverageRows: DropBagCoverageRow[]; onClose: () => void
}) {
    useEffect(() => {
        const previousTitle = document.title
        document.title = `${raceName} - ${waypoint.name} - Drop Bag`.replace(/[\\/:*?"<>|]/g, '-')
        return () => { document.title = previousTitle }
    }, [raceName, waypoint.name])

    const packed = items.filter(item => item.checked)
    const runnerPacked = packed.filter(item => item.category !== 'crew')
    const crewGear = items.filter(item => item.category === 'crew')
    const crewNotes = textFields.find(field => field.id === CREW_NOTES_FIELD_ID)
    return createPortal(<div className="single-bag-print-overlay fixed inset-0 z-[210] overflow-y-auto bg-black/80 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Printable drop bag">
        <div className="print:hidden mx-auto mb-3 flex max-w-3xl justify-end gap-3">
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white"><Printer className="h-4 w-4" />Print</button>
            <button onClick={onClose} className="flex items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-white"><X className="h-4 w-4" />Back</button>
        </div>
        <article className="single-bag-print-page mx-auto flex min-h-[9in] max-w-3xl flex-col bg-white p-6 text-black sm:p-8">
            <div className="border-b-2 border-black pb-3">
                <p className="text-sm">{raceName} · Drop Bag</p>
                <h1 className="mt-2 break-words text-4xl font-black leading-tight">{waypoint.name}</h1>
                {bagName && bagName !== waypoint.name && <h2 className="mt-1 break-words text-xl font-semibold">{bagName}</h2>}
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold text-red-700">
                    <span>Mile {waypoint.mile.toFixed(1)}</span>
                    {arrival && <span>Plan A arrival {arrival}</span>}
                    {cutoff && <span>Cutoff {cutoff}</span>}
                </div>
            </div>
            <section className="py-3">
                <h2 className="mb-1 text-sm font-bold uppercase tracking-wider">Inside this bag</h2>
                {runnerPacked.length ? <ul className="columns-2 list-disc gap-8 space-y-0 pl-5 text-base">
                    {runnerPacked.map(item => <li key={item.id} className="break-words">{item.quantity?.trim() && `${item.quantity} × `}{item.text}</li>)}
                </ul> : <p>No packed items yet.</p>}
            </section>
            {crewNotes && <section className="grid grid-cols-2 gap-6 border-t border-black py-3">
                <div><h2 className="mb-1 text-sm font-bold uppercase tracking-wider">Crew gear</h2>
                    {crewGear.length ? <ul className="list-disc pl-5 text-sm">{crewGear.map(item => <li key={item.id}>{item.quantity?.trim() && `${item.quantity} × `}{item.text}</li>)}</ul> : <p>No crew gear planned yet.</p>}
                </div>
                <div><h2 className="mb-1 text-sm font-bold uppercase tracking-wider">Crew notes</h2>
                    <Markdown className="break-words text-sm [&_p]:whitespace-pre-line !text-black [&_*]:!text-black">{crewNotes.value || 'No crew notes entered.'}</Markdown>
                </div>
            </section>}
            <div className="mt-auto space-y-2 border-t border-black pt-3">
                {textFields.filter(field => field.id !== CREW_NOTES_FIELD_ID).map(field => <section key={field.id}>
                    <h2 className="text-sm font-bold uppercase tracking-wide">{field.label}</h2>
                    <Markdown className="mt-1 break-words [&_p]:whitespace-pre-line !text-black [&_*]:!text-black">{field.value || 'No text entered.'}</Markdown>
                </section>)}
                {[['Notes', notes], ['Tell runner', waypoint.crew_relay_notes], ['Next leg reminder', waypoint.runner_next_leg_notes]].map(([label, text]) => text && <section key={label}>
                    <h2 className="text-sm font-bold uppercase tracking-wide">{label}</h2>
                    <Markdown className="mt-1 break-words [&_p]:whitespace-pre-line !text-black [&_*]:!text-black">{text}</Markdown>
                </section>)}
                <DropBagCoverage rows={coverageRows} print />
            </div>
        </article>
    </div>, document.body)
}
