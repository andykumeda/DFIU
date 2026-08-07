import { useState } from 'react'
import { SignupForm } from '../features/auth/SignupForm'
import { SiteFooter } from '@/components/ui/SiteFooter'
import { isValidSignupAccessCode } from '@/features/auth/signup-access-code'

export default function SignupPage() {
  const [accessCode, setAccessCode] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState(false)

  const handleUnlock = (event: React.FormEvent) => {
    event.preventDefault()
    const valid = isValidSignupAccessCode(accessCode)
    setUnlocked(valid)
    setError(!valid)
  }

  return (
    <div className='min-h-screen bg-neutral-950 flex flex-col'>
      <div className='flex-1 flex items-center justify-center p-4'>
        <div className='w-full max-w-md'>
          {unlocked ? (
            <SignupForm />
          ) : (
            <form
              onSubmit={handleUnlock}
              className='bg-neutral-900 border border-neutral-800 p-8 rounded-xl w-full max-w-md'
            >
              <h1 className='text-2xl font-bold text-white mb-2'>Create Account</h1>
              <p className='text-neutral-400 mb-6'>
                Enter your access code to create an account and save your race plans.
              </p>
              {error && (
                <div role='alert' className='bg-red-900/20 border border-red-900/50 text-red-200 p-3 rounded-lg mb-6 text-sm'>
                  That access code isn’t valid.
                </div>
              )}
              <label htmlFor='signup-access-code' className='block text-sm font-medium text-neutral-300 mb-1'>
                Access code
              </label>
              <input
                id='signup-access-code'
                type='text'
                inputMode='numeric'
                value={accessCode}
                onChange={(event) => {
                  setAccessCode(event.target.value)
                  setError(false)
                }}
                autoFocus
                required
                className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
              />
              <button
                type='submit'
                className='w-full mt-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors'
              >
                Continue
              </button>
              <p className='mt-5 text-center text-sm text-neutral-500'>
                Don&apos;t have an access code?{' '}
                <a href='mailto:andy@kumeda.com' className='text-blue-400 hover:text-blue-300 underline underline-offset-4'>
                  Email me to request one
                </a>
                .
              </p>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
