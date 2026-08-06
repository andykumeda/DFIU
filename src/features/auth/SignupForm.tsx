import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setClaimDemoIntent } from '@/features/demo/demoStore'
import { STRAVA_RETURN_TO_STORAGE_KEY } from '@/features/auth/StravaCallback'

const POST_SIGNUP_PATH = '/settings#runner-profile'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const claimDemo = searchParams.get('claim_demo')

  const handleStravaSignup = async () => {
    try {
      setError(null)
      setLoading(true)
      if (claimDemo) {
        setClaimDemoIntent(claimDemo)
      } else {
        sessionStorage.setItem(STRAVA_RETURN_TO_STORAGE_KEY, POST_SIGNUP_PATH)
      }
      const { data, error } = await supabase.functions.invoke('strava-auth', {
        body: { action: 'start', redirectUrl: window.location.origin + '/auth/strava/callback' }
      })
      if (error) throw error
      if (data?.state) sessionStorage.setItem('strava_oauth_state', data.state)
      if (data?.url) window.location.href = data.url
    } catch (e) {
      console.error('Strava auth error:', e)
      const message = e instanceof Error ? e.message : 'Failed to start Strava signup'
      setError(message)
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    if (claimDemo) setClaimDemoIntent(claimDemo)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate(claimDemo ? `/dashboard?claim_demo=${encodeURIComponent(claimDemo)}` : POST_SIGNUP_PATH)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='bg-neutral-900 border border-neutral-800 p-8 rounded-xl w-full max-w-md'>
      <h1 className='text-2xl font-bold text-white mb-2'>Create Account</h1>
      <p className='text-neutral-400 mb-2'>
        {claimDemo
          ? 'Create an account to save your demo event edits'
          : 'Start planning your next ultra'}
      </p>
      <p className='text-neutral-500 text-sm mb-6'>
        Linking Strava is recommended — it powers training overlap and activity analysis. Email and password works too.
      </p>

      <div className="mb-6">
        <button
          onClick={handleStravaSignup}
          type="button"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#FC4C02] hover:bg-[#E34402] text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 fill-current"><title>Strava</title><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
          {loading ? 'Connecting...' : 'Create account with Strava (recommended)'}
        </button>
        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-neutral-800"></div>
          <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs uppercase">Or continue with email and password</span>
          <div className="flex-grow border-t border-neutral-800"></div>
        </div>
      </div>

      {error && (
        <div className='bg-red-900/20 border border-red-900/50 text-red-200 p-3 rounded-lg mb-6 text-sm'>
          {error}
        </div>
      )}

      <div className='space-y-4'>
        <div>
          <label htmlFor='email' className='block text-sm font-medium text-neutral-300 mb-1'>Email</label>
          <input
            id='email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder='you@example.com'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <div>
          <label htmlFor='password' className='block text-sm font-medium text-neutral-300 mb-1'>Password</label>
          <input
            id='password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder='••••••••'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <div>
          <label htmlFor='confirmPassword' className='block text-sm font-medium text-neutral-300 mb-1'>Confirm Password</label>
          <input
            id='confirmPassword'
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder='••••••••'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <button
          type='submit'
          disabled={loading}
          className='w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </div>

      <p className='mt-6 text-center text-sm text-neutral-400'>
        Already have an account? <Link to='/login' className='text-blue-500 hover:text-blue-400 font-medium'>Sign in</Link>
      </p>
    </form>
  )
}
