
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'react-hot-toast'

export default function StravaCallback() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const code = searchParams.get('code')
        const errorParam = searchParams.get('error')

        if (errorParam) {
            setError('Strava authorization failed')
            return
        }

        if (!code) {
            setError('No authorization code found')
            return
        }

        handleCallback(code)
    }, [searchParams])

    async function handleCallback(code: string) {
        try {
            const { data, error } = await supabase.functions.invoke('strava-auth', {
                body: { action: 'callback', code }
            })

            if (error) throw error

            if (data?.session) {
                const { error: sessionError } = await supabase.auth.setSession(data.session)
                if (sessionError) throw sessionError
                toast.success('Successfully connected to Strava!')
                navigate('/dashboard')
            } else {
                throw new Error('No session returned')
            }
        } catch (e) {
            console.error('Callback error:', e)
            const message = e instanceof Error ? e.message : 'Failed to complete authentication'
            setError(message)
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
