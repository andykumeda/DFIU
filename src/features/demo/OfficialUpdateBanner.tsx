type OfficialUpdateBannerProps = {
  onMerge: () => void
  onDismiss: () => void
  busy?: boolean
}

export function OfficialUpdateBanner({ onMerge, onDismiss, busy }: OfficialUpdateBannerProps) {
  return (
    <div className='print:hidden border-b border-amber-800/60 bg-amber-950/40'>
      <div className='max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
        <p className='text-sm text-amber-100 flex-1'>
          The official event was updated. You can merge those changes into your saved plan, or keep your current version.
        </p>
        <div className='flex items-center gap-2 shrink-0'>
          <button
            type='button'
            disabled={busy}
            onClick={onMerge}
            className='px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-sm font-semibold disabled:opacity-50'
          >
            Merge updates
          </button>
          <button
            type='button'
            disabled={busy}
            onClick={onDismiss}
            className='px-3 py-1.5 rounded-lg border border-amber-700/80 text-amber-100 hover:bg-amber-900/40 text-sm font-medium disabled:opacity-50'
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
