import { Mail, MapPinned } from 'lucide-react'
import { PublicPageLayout } from '@/components/ui/PublicPageLayout'

export default function AboutPage() {
  return (
    <PublicPageLayout
      eyebrow='About DFIU'
      title="Keep race day details where you can find them."
      intro="DFIU is a race-planning workspace for bringing your course, pacing, logistics, training, and crew information together before race day."
    >
      <div className='grid gap-5 sm:grid-cols-2'>
        <section className='border border-neutral-800 bg-neutral-900/60 rounded-xl p-6'>
          <h2 className='text-xl font-bold'>What DFIU helps with</h2>
          <p className='mt-3 text-neutral-400 leading-7'>
            Build a course plan, estimate aid-station arrivals, coordinate crew and drop bags, compare training routes, and share the right view with the people supporting your race.
          </p>
        </section>

        <section className='border border-neutral-800 bg-neutral-900/60 rounded-xl p-6'>
          <h2 className='text-xl font-bold'>Contact</h2>
          <p className='mt-3 text-neutral-400 leading-7'>Questions, feedback, or a problem to report? Email the person behind DFIU.</p>
          <a
            href='mailto:andy@delta9.tech'
            className='mt-4 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 underline underline-offset-4'
          >
            <Mail size={17} aria-hidden='true' /> andy@delta9.tech
          </a>
        </section>
      </div>

      <div className='mt-5 border border-neutral-800 bg-neutral-900/40 rounded-xl p-6 flex gap-3 text-neutral-400'>
        <MapPinned className='mt-1 shrink-0 text-orange-400' size={20} aria-hidden='true' />
        <p className='leading-7'>DFIU is a planning aid. Always verify critical navigation, cutoffs, access, weather, and safety decisions with official race information.</p>
      </div>
    </PublicPageLayout>
  )
}
