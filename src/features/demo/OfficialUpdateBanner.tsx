import { useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import type { OfficialUpdateSection, OfficialUpdateSectionId } from './official-update-diff'

type OfficialUpdateBannerProps = {
  sections: OfficialUpdateSection[]
  loading?: boolean
  busy?: boolean
  onApply: (sections: OfficialUpdateSectionId[]) => void
}

export function OfficialUpdateBanner({ sections, loading, busy, onApply }: OfficialUpdateBannerProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<OfficialUpdateSectionId>>(new Set())

  const toggle = (id: OfficialUpdateSectionId) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const finish = (ids: OfficialUpdateSectionId[]) => { onApply(ids); setOpen(false) }

  return <>
    <div className='print:hidden border-b border-amber-800/60 bg-amber-950/40'>
      <div className='max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3'>
        <div className='text-sm text-amber-100 flex-1'>
          <span className='font-semibold'>Official event updates are available.</span>{' '}
          <span className='text-amber-100/80'>Review each changed area and choose what to apply.</span>
        </div>
        <button type='button' disabled={busy || loading} onClick={() => { setSelected(new Set(sections.map(section => section.id))); setOpen(true) }} className='shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50'>
          Review changes <ChevronRight className='w-4 h-4' />
        </button>
      </div>
    </div>

    {open && <div className='fixed inset-0 z-[250] overflow-y-auto bg-black/80 p-3 sm:p-6'>
      <div className='mx-auto flex min-h-full max-w-3xl items-center justify-center'>
        <div className='w-full overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl'>
          <div className='flex items-start justify-between gap-4 border-b border-neutral-800 p-5'>
            <div>
              <h2 className='text-xl font-bold text-white'>Review official updates</h2>
              <p className='mt-1 text-sm text-neutral-400'>Each line shows Current → Official. Applying a checked area replaces only the listed official-managed values; unchecked areas keep your current plan.</p>
            </div>
            <button type='button' onClick={() => setOpen(false)} className='rounded-lg bg-neutral-800 p-2 text-neutral-400 hover:text-white' aria-label='Close update review'><X className='w-5 h-5' /></button>
          </div>
          <div className='max-h-[65dvh] space-y-3 overflow-y-auto overflow-x-hidden p-4 sm:p-5'>
            {loading && <p className='text-sm text-neutral-400'>Comparing your plan with the official event…</p>}
            {!loading && sections.length === 0 && <p className='rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-300'>No visible differences remain. You can mark this official revision as reviewed.</p>}
            {sections.map(section => {
              const checked = selected.has(section.id)
              return <button key={section.id} type='button' onClick={() => toggle(section.id)} className={`w-full rounded-xl border p-4 text-left transition-colors ${checked ? 'border-amber-600/70 bg-amber-950/25' : 'border-neutral-800 bg-neutral-950/30'}`}>
                <span className='flex items-start gap-3'>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-amber-500 bg-amber-500 text-neutral-950' : 'border-neutral-600'}`}>{checked && <Check className='h-4 w-4' />}</span>
                  <span className='min-w-0 flex-1'>
                    <span className='block font-semibold text-white'>{section.title}</span>
                    <span className='mt-0.5 block text-sm text-neutral-400'>{section.description}</span>
                    <span className='mt-3 block space-y-1'>
                      {section.changes.map((change, index) => <span key={index} className='block break-words rounded bg-neutral-950/60 px-2.5 py-1.5 text-xs text-neutral-300'>{change}</span>)}
                    </span>
                  </span>
                </span>
              </button>
            })}
          </div>
          <div className='flex flex-col-reverse gap-2 border-t border-neutral-800 bg-neutral-900/95 p-4 sm:flex-row sm:justify-end'>
            <button type='button' disabled={busy} onClick={() => finish([])} className='rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50'>Keep all current</button>
            <button type='button' disabled={busy || loading} onClick={() => finish([...selected])} className='rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-50'>
              {selected.size ? `Apply ${selected.size} selected` : 'Finish review'}
            </button>
          </div>
        </div>
      </div>
    </div>}
  </>
}
