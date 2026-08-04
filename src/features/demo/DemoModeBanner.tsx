import { Link } from 'react-router-dom'
import { setClaimDemoIntent } from './demoStore'

type DemoModeBannerProps = {
  sourceRaceId: string
  tooLarge?: boolean
}

export function DemoModeBanner({ sourceRaceId, tooLarge }: DemoModeBannerProps) {
  const signupHref = `/signup?claim_demo=${encodeURIComponent(sourceRaceId)}`

  return (
    <div className='print:hidden border-b border-orange-800/50 bg-orange-950/35'>
      <div className='max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4'>
        <p className='text-sm text-orange-100 flex-1'>
          {tooLarge
            ? 'Demo storage is full on this device. Create an account to keep your plan.'
            : 'Demo mode — edits stay on this device until you save them to an account. Course geometry stays tied to the live event until you save.'}
        </p>
        <Link
          to={signupHref}
          onClick={() => setClaimDemoIntent(sourceRaceId)}
          className='shrink-0 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-neutral-950 text-sm font-semibold text-center'
        >
          Save to account
        </Link>
      </div>
    </div>
  )
}
