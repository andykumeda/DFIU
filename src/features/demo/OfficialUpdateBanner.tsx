import { useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { getDefaultOfficialUpdateChangeIds, type OfficialUpdateChange, type OfficialUpdateSection } from './official-update-diff'

type OfficialUpdateBannerProps = {
  sections: OfficialUpdateSection[]
  loading?: boolean
  busy?: boolean
  onApply: (changeIds: string[]) => void
}

function ChangeCompare({ change, checked, onToggle }: {
  change: OfficialUpdateChange
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${checked ? 'border-amber-600/70 bg-amber-950/20' : 'border-neutral-800 bg-neutral-950/40'}`}>
      <button type='button' onClick={onToggle} className='flex w-full items-start gap-3 text-left'>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-amber-500 bg-amber-500 text-neutral-950' : 'border-neutral-600'}`}>
          {checked && <Check className='h-4 w-4' />}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block font-medium text-white'>{change.label}</span>
        </span>
      </button>
      <div className='mt-3 grid gap-2 sm:grid-cols-2'>
        <div className='min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/70 p-2.5'>
          <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500'>Current</div>
          <pre className='max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-neutral-300'>{change.current}</pre>
        </div>
        <div className='min-w-0 rounded-lg border border-amber-900/40 bg-amber-950/15 p-2.5'>
          <div className='mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500/90'>Official</div>
          <pre className='max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-neutral-200'>{change.official}</pre>
        </div>
      </div>
    </div>
  )
}

export function OfficialUpdateBanner({ sections, loading, busy, onApply }: OfficialUpdateBannerProps) {
  const [open, setOpen] = useState(false)
  const defaultChangeIds = getDefaultOfficialUpdateChangeIds(sections)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const selectedIds = selected ?? new Set(defaultChangeIds)

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current ?? defaultChangeIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleSection = (section: OfficialUpdateSection) => setSelected(current => {
    const next = new Set(current ?? defaultChangeIds)
    const ids = section.changes.map(change => change.id)
    const allOn = ids.every(id => next.has(id))
    for (const id of ids) {
      if (allOn) next.delete(id)
      else next.add(id)
    }
    return next
  })
  const finish = (ids: string[]) => { onApply(ids); setOpen(false) }

  // A revision change alone is not a user-visible update.
  if (loading || sections.length === 0) return null

  return <>
    <div className='print:hidden border-b border-amber-800/60 bg-amber-950/40'>
      <div className='max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3'>
        <div className='text-sm text-amber-100 flex-1'>
          <span className='font-semibold'>Official event updates are available.</span>{' '}
          <span className='text-amber-100/80'>Review each change and choose what to apply.</span>
        </div>
        <button type='button' disabled={busy} aria-busy={loading} onClick={() => { setSelected(null); setOpen(true) }} className='shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50'>
          Review changes <ChevronRight className='w-4 h-4' />
        </button>
      </div>
    </div>

    {open && <div className='fixed inset-0 z-[250] overflow-y-auto bg-black/80 p-3 sm:p-6'>
      <div className='mx-auto flex min-h-full max-w-5xl items-center justify-center'>
        <div className='w-full overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl'>
          <div className='flex items-start justify-between gap-4 border-b border-neutral-800 p-5'>
            <div>
              <h2 className='text-xl font-bold text-white'>Review official updates</h2>
              <p className='mt-1 text-sm text-neutral-400'>Each change shows Current beside Official. Check only the values you want to replace; unchecked values stay as they are now. Older official text is left unchecked when your current text contains additional content.</p>
            </div>
            <button type='button' onClick={() => setOpen(false)} className='rounded-lg bg-neutral-800 p-2 text-neutral-400 hover:text-white' aria-label='Close update review'><X className='w-5 h-5' /></button>
          </div>
          <div className='max-h-[65dvh] space-y-5 overflow-y-auto overflow-x-hidden p-4 sm:p-5'>
            {loading && <p className='text-sm text-neutral-400'>Comparing your plan with the official event…</p>}
            {sections.map(section => {
              const sectionIds = section.changes.map(change => change.id)
              const checkedCount = sectionIds.filter(id => selectedIds.has(id)).length
              const sectionChecked = checkedCount === sectionIds.length && sectionIds.length > 0
              return <section key={section.id} className='space-y-3'>
                <button type='button' onClick={() => toggleSection(section)} className='flex w-full items-start gap-3 text-left'>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${sectionChecked ? 'border-amber-500 bg-amber-500 text-neutral-950' : 'border-neutral-600'}`}>
                    {sectionChecked && <Check className='h-4 w-4' />}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className='block font-semibold text-white'>{section.title}</span>
                    <span className='mt-0.5 block text-sm text-neutral-400'>{section.description}</span>
                    <span className='mt-1 block text-xs text-neutral-500'>{checkedCount} of {sectionIds.length} selected</span>
                  </span>
                </button>
                <div className='space-y-2 pl-0 sm:pl-8'>
                  {section.changes.map(change => (
                    <ChangeCompare
                      key={change.id}
                      change={change}
                      checked={selectedIds.has(change.id)}
                      onToggle={() => toggle(change.id)}
                    />
                  ))}
                </div>
              </section>
            })}
          </div>
          <div className='flex flex-col-reverse gap-2 border-t border-neutral-800 bg-neutral-900/95 p-4 sm:flex-row sm:justify-end'>
            <button type='button' disabled={busy || loading} onClick={() => finish([])} className='rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50'>Keep all current</button>
            <button type='button' disabled={busy || loading} onClick={() => finish([...selectedIds])} className='rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-50'>
              {selectedIds.size ? `Apply ${selectedIds.size} selected` : 'Finish review'}
            </button>
          </div>
        </div>
      </div>
    </div>}
  </>
}
