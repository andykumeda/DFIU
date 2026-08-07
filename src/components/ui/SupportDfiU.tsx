import { HeartHandshake, ExternalLink } from 'lucide-react'

const donationUrl = import.meta.env.VITE_DFIU_DONATION_URL?.trim() || ''
const supportEmail = 'andy@kumeda.com'
const contactUrl = `mailto:${supportEmail}?subject=Support%20DFIU`

export function SupportDfiU() {
  return (
    <section
      id='support-dfiu'
      className='border border-orange-900/60 bg-orange-950/20 rounded-xl p-6'
      aria-labelledby='support-dfiu-title'
    >
      <div className='flex items-start gap-3'>
        <HeartHandshake className='mt-0.5 shrink-0 text-orange-400' size={22} aria-hidden='true' />
        <div className='min-w-0'>
          <h2 id='support-dfiu-title' className='text-lg font-bold text-white'>Support DFIU</h2>
          <p className='mt-2 text-sm leading-6 text-neutral-300'>
            DFIU is free to use. If it helps you prepare for a better race day, consider supporting its continued development.
          </p>
          <div className='mt-4 flex flex-wrap items-center gap-3'>
            {donationUrl ? (
              <a
                href={donationUrl}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:ring-offset-orange-950'
              >
                Send a donation <ExternalLink size={15} aria-hidden='true' />
              </a>
            ) : (
              <span className='inline-flex items-center rounded-lg border border-orange-800/70 px-4 py-2 text-sm font-semibold text-orange-200'>
                Donation link coming soon
              </span>
            )}
            <a
              href={contactUrl}
              className='text-sm text-orange-300 underline underline-offset-4 transition-colors hover:text-orange-200'
            >
              Contact DFIU
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
