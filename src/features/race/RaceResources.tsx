'use client'

import { useRef, useState } from 'react'
import { Race } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import {
    BedDouble, CalendarDays, Edit2, Save, X, ExternalLink, Plus, Trash2,
    ChevronUp, ChevronDown, Eye, EyeOff, Printer,
} from 'lucide-react'
import {
    parseResourcesConfig,
    resourcesConfigToRacePatch,
    RESOURCE_ICON_MAP,
    type ResourceLinkEntry,
    type ResourcesConfig,
} from './resources-shared'
import { Markdown } from '@/components/Markdown'

interface RaceResourcesProps {
    race: Race
    canEdit?: boolean
    onUpdate: () => void
}

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

export function RaceResources({ race, canEdit = false, onUpdate }: RaceResourcesProps) {
    const { profile } = useAuth() as { profile: { clock_24h?: boolean } | null }
    const clock24h = !!profile?.clock_24h
    const [isEditing, setIsEditing] = useState(false)
    const [loading, setLoading] = useState(false)

    const [config, setConfig] = useState<ResourcesConfig>(() => parseResourcesConfig(race.resources_config, race))
    const [lodgingInfo, setLodgingInfo] = useState(race.lodging_info || '')
    const scheduleRef = useRef<HTMLDivElement>(null)

    const handlePrintSchedule = () => {
        const escapeHtml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        const body = scheduleRef.current?.innerHTML ?? ''
        const win = window.open('', '_blank', 'width=800,height=900')
        if (!win) {
            alert('Unable to open the print window. Please allow pop-ups for this site.')
            return
        }
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${escapeHtml(race.name)} — ${escapeHtml(config.schedule_label)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #111; line-height: 1.5; max-width: 720px; margin: 0 auto; padding: 40px 32px; }
  .doc-title { font-size: 1.6rem; font-weight: 800; margin: 0 0 2px; }
  .doc-sub { color: #555; margin: 0 0 24px; font-size: .95rem; }
  h1 { font-size: 1.35rem; } h2 { font-size: 1.15rem; } h3 { font-size: 1rem; }
  h1, h2, h3, h4 { margin: 1.1em 0 .4em; font-weight: 700; }
  ul, ol { padding-left: 1.4em; margin: .4em 0; }
  li { margin: .2em 0; }
  a { color: #1d4ed8; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1.2em 0; }
  table { border-collapse: collapse; width: 100%; margin: .6em 0; }
  th, td { border: 1px solid #ccc; padding: 5px 9px; text-align: left; }
  @media print { body { padding: 0; } }
</style></head><body>
<div class="doc-title">${escapeHtml(config.schedule_label)}</div>
<div class="doc-sub">${escapeHtml(race.name)}</div>
${body}
</body></html>`)
        win.document.close()
        win.focus()
        win.print()
    }
    const [dateDrafts, setDateDrafts] = useState<Record<string, ResourceDateDraft>>(() => {
        const parsed = parseResourcesConfig(race.resources_config, race)
        const drafts: Record<string, ResourceDateDraft> = {}
        for (const link of parsed.links) {
            if (link.hasDate) drafts[link.id] = toLocalDateDraft(link.datetime)
        }
        return drafts
    })

    const resetForm = () => {
        const parsed = parseResourcesConfig(race.resources_config, race)
        setConfig(parsed)
        setLodgingInfo(race.lodging_info || '')
        const drafts: Record<string, ResourceDateDraft> = {}
        for (const link of parsed.links) {
            if (link.hasDate) drafts[link.id] = toLocalDateDraft(link.datetime)
        }
        setDateDrafts(drafts)
    }

    const updateLink = (id: string, patch: Partial<ResourceLinkEntry>) => {
        setConfig(prev => ({
            ...prev,
            links: prev.links.map(l => l.id === id ? { ...l, ...patch } : l),
        }))
    }

    const moveLink = (index: number, direction: -1 | 1) => {
        setConfig(prev => {
            const links = [...prev.links]
            const target = index + direction
            if (target < 0 || target >= links.length) return prev
            ;[links[index], links[target]] = [links[target], links[index]]
            return { ...prev, links }
        })
    }

    const addCustomLink = () => {
        setConfig(prev => ({
            ...prev,
            links: [
                ...prev.links,
                {
                    id: `custom_${Date.now()}`,
                    label: 'Custom Link',
                    url: '',
                    datetime: null,
                    icon: 'link',
                    enabled: true,
                    hasDate: false,
                },
            ],
        }))
    }

    const removeLink = (id: string) => {
        setConfig(prev => ({ ...prev, links: prev.links.filter(l => l.id !== id) }))
    }

    const handleSave = async () => {
        for (const link of config.links) {
            if (!link.hasDate) continue
            const parsed = parseLocalDateDraft(dateDrafts[link.id] ?? { date: '', time: '' })
            if (parsed === '') {
                alert('Use 24-hour time as HH:MM. Midnight at the end of a day can be entered as 24:00.')
                return
            }
        }

        setLoading(true)
        try {
            const linksWithDates = config.links.map(link => ({
                ...link,
                datetime: link.hasDate
                    ? parseLocalDateDraft(dateDrafts[link.id] ?? { date: '', time: '' })
                    : null,
            }))
            const nextConfig = { ...config, links: linksWithDates }
            const legacyPatch = resourcesConfigToRacePatch(nextConfig)

            const { error } = await (supabase.from('races') as any)
                .update({
                    ...legacyPatch,
                    lodging_info: lodgingInfo || null,
                    resources_config: nextConfig,
                    racebook_last_updated: linksWithDates.find(l => l.id === 'racebook_url')?.url !== race.racebook_url
                        ? new Date().toISOString()
                        : race.racebook_last_updated,
                })
                .eq('id', race.id)

            if (error) throw error
            setConfig(nextConfig)
            onUpdate()
            setIsEditing(false)
        } catch (e) {
            console.error('Error saving resources:', e)
            alert('Failed to save changes')
        } finally {
            setLoading(false)
        }
    }

    const visibleLinks = config.links.filter(l => l.enabled || isEditing)

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Race Resources</h2>
                {canEdit && !isEditing ? (
                    <button
                        onClick={() => { resetForm(); setIsEditing(true) }}
                        className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        <Edit2 className="w-4 h-4" /> Edit Resources
                    </button>
                ) : canEdit && isEditing ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { setIsEditing(false); resetForm() }}
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
                ) : null}
            </div>

            {isEditing && (
                <div className="flex justify-end">
                    <button
                        onClick={addCustomLink}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300"
                    >
                        <Plus className="w-4 h-4" /> Add custom resource
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(isEditing ? config.links : visibleLinks).map((link, index) => {
                    const Icon = RESOURCE_ICON_MAP[link.icon] ?? RESOURCE_ICON_MAP.link
                    const hasContent = !!link.url || isEditing

                    if (!isEditing && !link.enabled) return null

                    return (
                        <div
                            key={link.id}
                            className={`${isEditing ? 'bg-neutral-900/50' : 'bg-neutral-900'} border border-neutral-800 rounded-xl p-4 transition-colors ${!link.enabled && isEditing ? 'opacity-60' : ''}`}
                        >
                            <div className="flex items-start gap-4">
                                {isEditing && (
                                    <div className="flex flex-col gap-1 shrink-0">
                                        <button onClick={() => moveLink(index, -1)} disabled={index === 0} className="text-neutral-500 hover:text-white disabled:opacity-30 p-1">
                                            <ChevronUp className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => moveLink(index, 1)} disabled={index === config.links.length - 1} className="text-neutral-500 hover:text-white disabled:opacity-30 p-1">
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${hasContent ? 'bg-blue-500/10 text-blue-500' : 'bg-neutral-800 text-neutral-600'}`}>
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    {isEditing ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={link.label}
                                                    onChange={e => updateLink(link.id, { label: e.target.value })}
                                                />
                                                <button
                                                    onClick={() => updateLink(link.id, { enabled: !link.enabled })}
                                                    className="text-neutral-500 hover:text-white p-1"
                                                    title={link.enabled ? 'Hide resource' : 'Show resource'}
                                                >
                                                    {link.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                </button>
                                                {link.id.startsWith('custom_') && (
                                                    <button onClick={() => removeLink(link.id)} className="text-neutral-500 hover:text-red-400 p-1">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                placeholder="URL"
                                                value={link.url}
                                                onChange={e => updateLink(link.id, { url: e.target.value })}
                                            />
                                            {(link.id === 'tracking_url' || link.id === 'live_results_url') && (
                                                <input
                                                    type="text"
                                                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white placeholder-neutral-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                    placeholder="Embed URL"
                                                    value={link.embed_url ?? ''}
                                                    onChange={e => updateLink(link.id, { embed_url: e.target.value })}
                                                />
                                            )}
                                            {link.hasDate && (
                                                <div className="grid grid-cols-[1fr_96px] gap-2">
                                                    <input
                                                        type="date"
                                                        className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                                        value={dateDrafts[link.id]?.date ?? ''}
                                                        onChange={e => setDateDrafts(prev => ({ ...prev, [link.id]: { ...prev[link.id], date: e.target.value } }))}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                                                        placeholder="HH:MM"
                                                        value={dateDrafts[link.id]?.time ?? ''}
                                                        onChange={e => setDateDrafts(prev => ({ ...prev, [link.id]: { ...prev[link.id], time: e.target.value } }))}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <label className="text-sm font-medium text-neutral-300 block mb-1">
                                                {link.label}
                                                {link.id === 'racebook_url' && race.racebook_last_updated && (
                                                    <span className="ml-2 text-xs text-neutral-500 font-normal">
                                                        Updated {new Date(race.racebook_last_updated).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </label>
                                            <div className="flex flex-col gap-1">
                                                {link.url ? (
                                                    <a
                                                        href={link.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm text-blue-400 hover:text-blue-300 truncate block flex items-center gap-1 group"
                                                    >
                                                        <span className="truncate">{link.url}</span>
                                                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                                    </a>
                                                ) : (
                                                    <span className="text-sm text-neutral-600 italic">Not provided</span>
                                                )}
                                                {link.hasDate && link.datetime && (
                                                    <div className="text-xs text-neutral-400">
                                                        {new Date(link.datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', hour12: !clock24h })}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {(config.lodging_enabled || isEditing) && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                            <BedDouble className="w-5 h-5" />
                        </div>
                        {isEditing ? (
                            <input
                                type="text"
                                className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-bold focus:ring-1 focus:ring-amber-500 outline-none"
                                value={config.lodging_label}
                                onChange={e => setConfig(prev => ({ ...prev, lodging_label: e.target.value }))}
                            />
                        ) : (
                            <h3 className="text-lg font-bold text-white">{config.lodging_label}</h3>
                        )}
                        {isEditing && (
                            <button
                                onClick={() => setConfig(prev => ({ ...prev, lodging_enabled: !prev.lodging_enabled }))}
                                className="text-neutral-500 hover:text-white p-1"
                            >
                                {config.lodging_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <textarea
                            className="w-full h-64 bg-neutral-950 border border-neutral-800 rounded-lg p-4 text-white font-mono text-sm focus:ring-1 focus:ring-amber-500 outline-none resize-y"
                            placeholder="# Recommended Hotels..."
                            value={lodgingInfo}
                            onChange={e => setLodgingInfo(e.target.value)}
                        />
                    ) : (
                        lodgingInfo ? (
                            <Markdown>{lodgingInfo}</Markdown>
                        ) : (
                            <div className="text-neutral-600 italic">No recommendations provided yet.</div>
                        )
                    )}
                </div>
            )}

            {(config.schedule_enabled || isEditing) && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                        {isEditing ? (
                            <input
                                type="text"
                                className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                                value={config.schedule_label}
                                onChange={e => setConfig(prev => ({ ...prev, schedule_label: e.target.value }))}
                            />
                        ) : (
                            <h3 className="text-lg font-bold text-white">{config.schedule_label}</h3>
                        )}
                        {isEditing ? (
                            <button
                                onClick={() => setConfig(prev => ({ ...prev, schedule_enabled: !prev.schedule_enabled }))}
                                className="text-neutral-500 hover:text-white p-1"
                            >
                                {config.schedule_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                        ) : config.schedule_info ? (
                            <button
                                onClick={handlePrintSchedule}
                                className="ml-auto flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-medium border border-neutral-700"
                            >
                                <Printer className="w-4 h-4" />
                                Print
                            </button>
                        ) : null}
                    </div>

                    {isEditing ? (
                        <textarea
                            className="w-full h-64 bg-neutral-950 border border-neutral-800 rounded-lg p-4 text-white font-mono text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-y"
                            placeholder="# Friday&#10;- 4:00 PM Packet Pickup&#10;- 6:00 PM Pre-Race Briefing&#10;&#10;# Saturday&#10;- 5:00 AM Start..."
                            value={config.schedule_info}
                            onChange={e => setConfig(prev => ({ ...prev, schedule_info: e.target.value }))}
                        />
                    ) : (
                        config.schedule_info ? (
                            <div ref={scheduleRef}>
                                <Markdown>{config.schedule_info}</Markdown>
                            </div>
                        ) : (
                            <div className="text-neutral-600 italic">No schedule provided yet.</div>
                        )
                    )}
                </div>
            )}
        </div>
    )
}
