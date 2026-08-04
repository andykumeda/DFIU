
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'react-hot-toast'
import { messageFromFunctionError } from './strava-function-error'

const STATE_STORAGE_KEY = 'strava_oauth_state'
export const STRAVA_RETURN_TO_STORAGE_KEY = 'strava_oauth_return_to'

export default function StravaCallback() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const errorParam = searchParams.get('error')

        if (errorParam) {
            setError('Strava authorization failed')
            return
        }

        if (!code) {
            setError('No authorization code found')
            return
        }

        if (!state) {
            setError('Missing OAuth state')
            return
        }

        const storedState = sessionStorage.getItem(STATE_STORAGE_KEY)
        if (!storedState || storedState !== state) {
            setError('OAuth state mismatch — please try signing in again')
            return
        }

        handleCallback(code, state)
    }, [searchParams])

    async function handleCallback(code: string, state: string) {
        try {
            const { data, error } = await supabase.functions.invoke('strava-auth', {
                body: { action: 'callback', code, state }
            })

            if (error) throw error

            sessionStorage.removeItem(STATE_STORAGE_KEY)

            if (data?.connected) {
                toast.success('Strava is connected!')
                const returnTo = sessionStorage.getItem(STRAVA_RETURN_TO_STORAGE_KEY)
                sessionStorage.removeItem(STRAVA_RETURN_TO_STORAGE_KEY)
                navigate(returnTo && returnTo.startsWith('/race/') ? returnTo : '/dashboard')
            } else if (data?.session) {
                const { error: sessionError } = await supabase.auth.setSession(data.session)
                if (sessionError) throw sessionError
                toast.success('Successfully connected to Strava!')
                const returnTo = sessionStorage.getItem(STRAVA_RETURN_TO_STORAGE_KEY)
                sessionStorage.removeItem(STRAVA_RETURN_TO_STORAGE_KEY)
                const claimDemo = sessionStorage.getItem('dfiu_claim_demo_race_id')
                if (claimDemo) {
                    navigate(`/dashboard?claim_demo=${encodeURIComponent(claimDemo)}`)
                } else {
                    navigate(returnTo && returnTo.startsWith('/race/') ? returnTo : '/dashboard')
                }
            } else {
                throw new Error(data?.error || 'No session returned')
            }
        } catch (e) {
            console.error('Callback error:', e)
            sessionStorage.removeItem(STATE_STORAGE_KEY)
            sessionStorage.removeItem(STRAVA_RETURN_TO_STORAGE_KEY)
            setError(await messageFromFunctionError(e, 'Failed to complete authentication'))
        }
    }

    if (error) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
                <div className="bg-red-900/20 border border-red-900 text-red-200 p-6 rounded-xl max-w-md w-full text-center">
                    <h2 className="text-xl font-bold mb-2">Login Failed</h2>
                    <p>{error}</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="mt-4 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-4 text-neutral-400">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                <p>Completing Strava login...</p>
            </div>
        </div>
    )
}
