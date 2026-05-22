'use client'

import { useState } from 'react'
import { Race } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import {
    FileText, Mic, MapPin, Trophy, Camera, Users, Radio, BedDouble,
    Edit2, Save, X, ExternalLink
} from 'lucide-react'

interface RaceResourcesProps {
    race: Race
    onUpdate: () => void
}

type ResourceDateKey = 'briefing_datetime' | 'packet_pickup_datetime'
type ResourceDateDraft = { date: string; time: string }

function toLocalDateDraft(value: string | null | undefined): ResourceDateDraft {
    if (!value) return { date: '', time: '' }
    const d = new Date(value)
    if (isNaN(d.getTime())) return { date: '', time: '' }
    const yyyy = d.getFullYear()
    const mm = (d.getMonth() + 1).toString().padStart(2, '0')
    const dd = d.getDate().toString().padStart(2, '0')
    const hh = d.getHours().toString().padStart(2, '0')
    const mi = d.getMinutes().toString().padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
}

function parseLocalDateDraft(draft: ResourceDateDraft): string | null {
    if (!draft.date && !draft.time) return null
    const time = draft.time.trim()
    const match = time.match(/^([01]?\d|2[0-4]):([0-5]\d)$/)
    if (!draft.date || !match) return ''

    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour === 24 && minute !== 0) return ''

    const [year, month, day] = draft.date.split('-').map(Number)
    const parsed = new Date(year, month - 1, day, hour === 24 ? 0 : hour, minute)
    if (hour === 24) parsed.setDate(parsed.getDate() + 1)
    return isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

export function RaceResources({ race, onUpdate }: RaceResourcesProps) {
    const { profile } = useAuth() as { profile: { clock_24h?: boolean } | null }
    const clock24h = !!profile?.clock_24h
    const [isEditing, setIsEditing] = useState(false)
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState<{
        racebook_url: string
        briefing_url: string
        briefing_datetime: string
        packet_pickup_url: string
        packet_pickup_datetime: string
        past_results_url: string
        media_url: string
        entrants_url: string
        tracking_url: string
        lodging_info: string
    }>({
        racebook_url: race.racebook_url || '',
        briefing_url: race.briefing_url || '',
        briefing_datetime: race.briefing_datetime || '',
        packet_pickup_url: race.packet_pickup_url || '',
        packet_pickup_datetime: race.packet_pickup_datetime || '',
        past_results_url: race.past_results_url || '',
        media_url: race.media_url || '',
        entrants_url: race.entrants_url || '',
        tracking_url: race.tracking_url || '',
        lodging_info: race.lodging_info || ''
    })
    const [dateDrafts, setDateDrafts] = useState<Record<ResourceDateKey, ResourceDateDraft>>({
        briefing_datetime: toLocalDateDraft(race.briefing_datetime),
        packet_pickup_datetime: toLocalDateDraft(race.packet_pickup_datetime),
    })

    const updateDateDraft = (key: ResourceDateKey, patch: Partial<ResourceDateDraft>) => {
        setDateDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    }

    const handleSave = async () => {
        const briefingDate = parseLocalDateDraft(dateDrafts.briefing_datetime)
        const packetPickupDate = parseLocalDateDraft(dateDrafts.packet_pickup_datetime)
        if (briefingDate === '' || packetPickupDate === '') {
            alert('Use 24-hour time as HH:MM. Midnight at the end of a day can be entered as 24:00.')
            return
        }

        setLoading(true)
        try {
            const { error } = await (supabase
                .from('races') as any)
                .update({
                    racebook_url: formData.racebook_url || null,
                    briefing_url: formData.briefing_url || null,
                    briefing_datetime: briefingDate,
                    packet_pickup_url: formData.packet_pickup_url || null,
                    packet_pickup_datetime: packetPickupDate,
                    past_results_url: formData.past_results_url || null,
                    media_url: formData.media_url || null,
                    entrants_url: formData.entrants_url || null,
                    tracking_url: formData.tracking_url || null,
                    lodging_info: formData.lodging_info || null,
                    racebook_last_updated: formData.racebook_url !== race.racebook_url ? new Date().toISOString() : race.racebook_last_updated
                } as any)
                .eq('id', race.id)

            if (error) throw error

            setFormData(prev => ({
                ...prev,
                briefing_datetime: briefingDate || '',
                packet_pickup_datetime: packetPickupDate || '',
            }))
            onUpdate()
            setIsEditing(false)
        } catch (e) {
            console.error('Error saving resources:', e)
            alert('Failed to save changes')
        } finally {
            setLoading(false)
        }
    }

    type ResourceConfig = {
        key: keyof typeof formData
        label: string
        icon: React.ElementType
        placeholder: string
    } & (
            | { hasDate: true; dateKey: ResourceDateKey }
            | { hasDate?: false; dateKey?: never }
        )

    // Define resources configuration for mapping
    const resources: ResourceConfig[] = [
        { key: 'racebook_url', label: 'Racebook / Guide', icon: FileText, placeholder: 'URL to PDF or doc' },
        { key: 'briefing_url', label: 'Pre-Race Briefing', icon: Mic, placeholder: 'Video or Zoom link', hasDate: true, dateKey: 'briefing_datetime' },
        { key: 'packet_pickup_url', label: 'Packet Pickup Info', icon: MapPin, placeholder: 'Link to location/details', hasDate: true, dateKey: 'packet_pickup_datetime' },
        { key: 'past_results_url', label: 'Past Results', icon: Trophy, placeholder: 'UltraSignup/Athlinks URL' },
        { key: 'media_url', label: 'Media / Photos', icon: Camera, placeholder: 'Photo gallery link' },
        { key: 'entrants_url', label: 'Entrants List', icon: Users, placeholder: 'Registration list URL' },
        { key: 'tracking_url', label: 'Live Tracking', icon: Radio, placeholder: 'Live tracking URL' },
    ]

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Race Resources</h2>
                {!isEditing ? (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        <Edit2 className="w-4 h-4" /> Edit Resources
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors text-sm font-medium"
                            disabled={loading}
                        >
                            <X className="w-4 h-4" /> Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
                            disabled={loading}
                        >
                            <Save className="w-4 h-4" /> {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resources.map((res) => (
                    <div key={res.key} className={`${isEditing ? 'bg-neutral-900/50' : 'bg-neutral-900'} border border-neutral-800 rounded-xl p-4 transition-colors`}>
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${formData[res.key] || isEditing ? 'bg-blue-500/10 text-blue-500' : 'bg-neutral-800 text-neutral-600'}`}>
                                <res.icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <label className="text-sm font-medium text-neutral-300 block mb-1">
                                    {res.label}
                                    {res.key === 'racebook_url' && race.racebook_last_updated && !isEditing && (
                                        <span className="ml-2 text-xs text-neutral-500 font-normal">
                                            Updated {new Date(race.racebook_last_updated).toLocaleDateString()}
                                        </span>
                                    )}
                                </label>
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                            placeholder={res.placeholder}
                                            value={formData[res.key]}
                                            onChange={(e) => setFormData(prev => ({ ...prev, [res.key]: e.target.value }))}
                                        />
                                        {res.hasDate && (
                                            <div className="grid grid-cols-[1fr_96px] gap-2">
                                                <input
                                                    type="date"
                                                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white placeholder-neutral-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={dateDrafts[res.dateKey].date}
                                                    onChange={(e) => updateDateDraft(res.dateKey, { date: e.target.value })}
                                                />
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-2]?[0-9]:[0-5][0-9]"
                                                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white placeholder-neutral-700 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                                    placeholder="HH:MM"
                                                    value={dateDrafts[res.dateKey].time}
                                                    onChange={(e) => updateDateDraft(res.dateKey, { time: e.target.value })}
                                                />
                                                <div className="col-span-2 text-[10px] text-neutral-500">
                                                    24-hour time, e.g. 18:30 or 24:00.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {formData[res.key] ? (
                                            <a
                                                href={formData[res.key]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-blue-400 hover:text-blue-300 truncate block flex items-center gap-1 group"
                                            >
                                                <span className="truncate">{formData[res.key]}</span>
                                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </a>
                                        ) : (
                                            <span className="text-sm text-neutral-600 italic">Not provided</span>
                                        )}
                                        {res.hasDate && formData[res.dateKey] && (
                                            <div className="text-xs text-neutral-400">
                                                {new Date(formData[res.dateKey]).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', hour12: !clock24h })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Lodging & Dining Section */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                        <BedDouble className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Lodging & Dining Recommendations</h3>
                </div>

                {isEditing ? (
                    <textarea
                        className="w-full h-64 bg-neutral-950 border border-neutral-800 rounded-lg p-4 text-white font-mono text-sm focus:ring-1 focus:ring-amber-500 outline-none resize-y"
                        placeholder="# Recommended Hotels...&#10;- Hotel A&#10;- Hotel B&#10;&#10;# Places to Eat..."
                        value={formData.lodging_info}
                        onChange={(e) => setFormData(prev => ({ ...prev, lodging_info: e.target.value }))}
                    />
                ) : (
                    <div className="prose prose-invert max-w-none text-neutral-300">
                        {formData.lodging_info ? (
                            <div className="whitespace-pre-wrap">{formData.lodging_info}</div>
                        ) : (
                            <div className="text-neutral-600 italic">No recommendations provided yet.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
