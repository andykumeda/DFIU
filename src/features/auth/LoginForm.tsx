import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <form onSubmit={handleSubmit} className='bg-neutral-900 border border-neutral-800 p-8 rounded-xl w-full max-w-md'>
      <h1 className='text-2xl font-bold text-white mb-2'>Sign In</h1>
      <p className='text-neutral-400 mb-6'>Welcome back to DFIU</p>

      <div className="mb-6">
        <button
          onClick={async () => {
            try {
              setLoading(true)
              const { data, error } = await supabase.functions.invoke('strava-auth', {
                body: { action: 'start', redirectUrl: window.location.origin + '/auth/strava/callback' }
              })
              if (error) throw error
              if (data?.url) window.location.href = data.url
            } catch (e) {
              console.error('Strava auth error:', e)
              setError('Failed to start Strava login')
              setLoading(false)
            }
          }}
          type="button"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#FC4C02] hover:bg-[#E34402] text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 fill-current"><title>Strava</title><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
          {loading ? 'Connecting...' : 'Sign in with Strava'}
        </button>
        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-neutral-800"></div>
          <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs uppercase">Or sign in with email</span>
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
            className='w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
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
            className='w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <button
          type='submit'
          disabled={loading}
          className='w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>

      <p className='mt-6 text-center text-sm text-neutral-400'>
        Don&apos;t have an account? <Link to='/signup' className='text-blue-500 hover:text-blue-400 font-medium'>Sign up</Link>
      </p>
    </form>
  )
}
