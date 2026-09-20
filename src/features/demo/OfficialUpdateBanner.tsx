type OfficialUpdateBannerProps = {
  onUseOfficial: () => void
  onKeepCurrent: () => void
  busy?: boolean
}

export function OfficialUpdateBanner({ onUseOfficial, onKeepCurrent, busy }: OfficialUpdateBannerProps) {
  return (
    <div className='print:hidden border-b border-amber-800/60 bg-amber-950/40'>
      <div className='max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
        <div className='text-sm text-amber-100 flex-1 space-y-1'>
          <p className='font-semibold'>The official event has changed.</p>
          <p className='text-amber-100/80'>
            Using the official version replaces event details, Resources, course and aid-station data, terrain, and the drop-bag template. Your plan name, pace goals, training routes, check-ins, and bag contents are kept when their station still exists.
          </p>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <button
            type='button'
            disabled={busy}
            onClick={onUseOfficial}
            className='px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-sm font-semibold disabled:opacity-50'
          >
            Use official version
          </button>
          <button
            type='button'
            disabled={busy}
            onClick={onKeepCurrent}
            className='px-3 py-1.5 rounded-lg border border-amber-700/80 text-amber-100 hover:bg-amber-900/40 text-sm font-medium disabled:opacity-50'
          >
            Keep my current plan
          </button>
        </div>
      </div>
    </div>
  )
}
