import type { DropBagTextFieldValue } from './drop-bag-shared'

export function DropBagTextFields({ fields }: { fields: DropBagTextFieldValue[] }) {
    if (!fields.length) return null
    return <div className="space-y-3">
        {fields.map(field => <div key={field.id} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-neutral-500">{field.label}</div>
            <div className="whitespace-pre-wrap text-sm text-neutral-100">{field.value || 'No text entered.'}</div>
        </div>)}
    </div>
}
