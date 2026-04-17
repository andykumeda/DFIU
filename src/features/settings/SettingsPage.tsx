'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'

interface UserProfile {
    id: string
    email: string
    display_name: string | null
    avatar_url: string | null
    units_distance: 'miles' | 'kilometers'
    units_elevation: 'feet' | 'meters'
    clock_24h: boolean
}

export default function SettingsPage() {
    const { user, refreshProfile } = useAuth()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [formData, setFormData] = useState<UserProfile>({
        id: '',
        email: '',
        display_name: '',
        avatar_url: null,
        units_distance: 'miles',
        units_elevation: 'feet',
        clock_24h: false
    })

    useEffect(() => {
        if (user) {
            loadProfile()
        }
    }, [user])

    async function loadProfile() {
        if (!user?.id) return

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle()

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profile = data as any

            if (profile) {
                setFormData({
                    id: profile.id,
                    // Use profile email if set, otherwise fallback to auth email
                    // If auth email is dummy strava email, we prefer profile email if it exists, or empty if not
                    email: profile.email || (user.email?.endsWith('@strava.dfiu.app') ? '' : user.email) || '',
                    display_name: profile.name || '',
                    avatar_url: profile.avatar_url || null,
                    units_distance: profile.units_distance || 'miles',
                    units_elevation: profile.units_elevation || 'feet',
                    clock_24h: profile.clock_24h || false
                })
            } else {
                setFormData(prev => ({
                    ...prev,
                    id: user.id,
                    email: (user.email?.endsWith('@strava.dfiu.app') ? '' : user.email) || ''
                }))
            }
        } catch (error) {
            console.error('Error loading profile:', error)
            toast.error('Failed to load settings')
        } finally {
            setLoading(false)
        }
    }

    async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
        if (!event.target.files || event.target.files.length === 0) {
            return
        }
        if (!user?.id) return

        setIsUploading(true)
        const file = event.target.files[0]
        const fileExt = file.name.split('.').pop()
        const filePath = `${user.id}.${fileExt}`

        try {
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true })

            if (uploadError) throw uploadError

            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)

            setFormData(prev => ({ ...prev, avatar_url: data.publicUrl }))
            toast.success('Photo uploaded')
        } catch (error) {
            console.error('Error uploading avatar:', error)
            toast.error('Error uploading photo')
        } finally {
            setIsUploading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!user?.id) return
        setSaving(true)

        try {
            // If regular user (not dummy strava email), try to update auth email
            if (user.email && !user.email.endsWith('@strava.dfiu.app') && formData.email !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({ email: formData.email })
                if (emailError) throw emailError
                toast.success('Check your new email for a confirmation link')
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('profiles') as any)
                .upsert({
                    id: user.id,
                    name: formData.display_name,
                    email: formData.email, // Save email to profile for everyone
                    avatar_url: formData.avatar_url,
                    units_distance: formData.units_distance,
                    units_elevation: formData.units_elevation,
                    clock_24h: formData.clock_24h,
                    updated_at: new Date().toISOString()
                })
                .select()



            if (error) throw error
            toast.success('Settings saved')
            refreshProfile?.()
        } catch (error) {
            console.error('Error saving settings:', error)
            toast.error(`Failed to save settings: ${(error as any).message || 'Unknown error'}`)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-neutral-400">Loading settings...</div>
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            <header className="border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
                    <Link to="/dashboard" className="text-neutral-400 hover:text-white transition-colors">
                        ← Back to Dashboard
                    </Link>
                    <h1 className="text-xl font-bold">Settings</h1>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-8">
                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Profile Section */}
                    <section className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                        <h2 className="text-lg font-semibold mb-4 text-orange-500">Profile</h2>

                        <div className="flex flex-col md:flex-row gap-6 items-start">
                            {/* Avatar */}
                            <div className="flex flex-col items-center gap-2">
                                <div className="relative w-24 h-24 rounded-full overflow-hidden bg-neutral-800 border-2 border-neutral-700">
                                    {formData.avatar_url ? (
                                        <img src={formData.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-neutral-500 text-3xl font-bold">
                                            {(formData.display_name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                                        </div>
                                    )}
                                    {isUploading && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white text-xs px-3 py-1.5 rounded-md transition-colors border border-neutral-700">
                                    Change Photo
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleAvatarUpload}
                                        disabled={isUploading}
                                    />
                                </label>
                            </div>

                            <div className="flex-1 space-y-4 w-full">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        value={formData.display_name || ''}
                                        onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                        placeholder="Enter your name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                        placeholder="Enter your email"
                                    />
                                    {user?.email?.endsWith('@strava.dfiu.app') && (
                                        <div className="mt-1 text-xs text-orange-500 flex items-center gap-2">
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" /></svg>
                                            Connected via Strava
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Preferences Section */}
                    <section className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
                        <h2 className="text-lg font-semibold mb-4 text-orange-500">Preferences</h2>
                        <div className="space-y-6">
                            {/* Units */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Distance Units</label>
                                    <select
                                        value={formData.units_distance}
                                        onChange={e => setFormData({ ...formData, units_distance: e.target.value as any })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                    >
                                        <option value="miles">Miles</option>
                                        <option value="kilometers">Kilometers</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Elevation Units</label>
                                    <select
                                        value={formData.units_elevation}
                                        onChange={e => setFormData({ ...formData, units_elevation: e.target.value as any })}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                    >
                                        <option value="feet">Feet</option>
                                        <option value="meters">Meters</option>
                                    </select>
                                </div>
                            </div>

                            {/* Clock Format */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="block text-sm font-medium text-white">24-Hour Clock</span>
                                    <span className="text-xs text-neutral-500">Use 24-hour format (e.g., 17:00) instead of 12-hour (5:00 PM)</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.clock_24h}
                                        onChange={e => setFormData({ ...formData, clock_24h: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                </label>
                            </div>
                        </div>
                    </section>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    )
}
