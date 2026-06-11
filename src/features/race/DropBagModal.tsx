import { useState, useEffect, useMemo } from 'react'
import { Race, Waypoint, type Json } from '@/types/database'
import { X, Save, Plus, Trash2, Clock, Sun, Moon, Info, CheckCircle2, Circle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
    DROP_BAG_CATEGORIES,
    DropBagItem,
    getDropBagEditorItems,
    getBagKind,
    getBagKindLabel,
    getDropBagTemplateForKind,
    getDropBagNotes,
    parseDropBagTemplate,
} from './drop-bag-shared'
import { DropBagNotes } from './DropBagNotes'
import { DropBagSummary } from './DropBagSummary'

interface DropBagModalProps {
    waypoint: Waypoint
    race: Race
    arrivalTime?: { arrivalTime: number, timeOfDay: string }
    coverageRows?: DropBagCoverageRow[]
    isNight: boolean
    canEdit?: boolean
    /** Show only what's packed in the bag (no editor/template), like Crew View.
     *  Used everywhere except the dedicated Drop Bag section. */
    contentsOnly?: boolean
    onClose: () => void
}

export interface DropBagCoverageRow {
    label: string
    labelClass: string
    targetName: string | null
    targetMile: number | null
    milesUntil: number | null
    plans: Array<{
        label: string
        colorClass: string
        timeOfDay: string | null
        duration: string | null
    }>
}

export function DropBagModal({ waypoint, race, arrivalTime, coverageRows = [], isNight, canEdit = true, contentsOnly = false, onClose }: DropBagModalProps) {
    const queryClient = useQueryClient()
    const [items, setItems] = useState<DropBagItem[]>([])
    const [newItemText, setNewItemText] = useState('')
    const [saving, setSaving] = useState(false)
    const [bagName, setBagName] = useState(waypoint.drop_bag_name || '')
    const [bagNotes, setBagNotes] = useState(() => getDropBagNotes(waypoint))

    const isHot = parseInt(race.avg_temp_high || '0') >= 80
    const isCold = parseInt(race.avg_temp_low || '100') <= 40
    const bagKind = getBagKind(waypoint) ?? 'official'
    const isStartBag = bagKind === 'start'
    const isCrewBag = bagKind === 'crew'
    const template = useMemo(
        () => getDropBagTemplateForKind(bagKind, parseDropBagTemplate(race.drop_bag_template)),
        [bagKind, race.drop_bag_template]
    )
    const bagNoun = isStartBag ? 'Start Gear' : isCrewBag ? 'Crew Bag' : 'Drop Bag'
    const bagNameLabel = isStartBag ? 'Start Gear' : isCrewBag ? 'Crew Bag' : 'Bag Name'

    useEffect(() => {
        setItems(getDropBagEditorItems(waypoint.drop_bag_items, template, { isNight, isHot, isCold }))
    }, [waypoint.id, waypoint.drop_bag_items, template, isNight, isHot, isCold])

    useEffect(() => {
        setBagName(waypoint.drop_bag_name || '')
        setBagNotes(waypoint.drop_bag_notes || waypoint.notes || '')
    }, [waypoint.id, waypoint.drop_bag_name, waypoint.drop_bag_notes, waypoint.notes])

    const handleSave = async () => {
        if (!canEdit) return
        setSaving(true)
        const itemsToSave = items.reduce<DropBagItem[]>((acc, item) => {
            const text = item.text.trim()
            if (!text) return acc
            const quantity = item.quantity?.trim()
            acc.push({
                ...item,
                text,
                quantity: quantity || undefined,
            })
            return acc
        }, [])
        try {
            const { error } = await supabase
                .from('waypoints')
                .update({
                    drop_bag_items: itemsToSave as unknown as Json,
                    drop_bag_name: bagName,
                    drop_bag_notes: bagNotes
                })
                .eq('id', waypoint.id)
                .select('id')
                .single()

            if (error) throw error
            setItems(itemsToSave)
            queryClient.invalidateQueries({ queryKey: ['waypoints', waypoint.course_id] })
            onClose()
        } catch (err) {
            console.error('Failed to save bag:', err)
            alert('Failed to save bag contents')
        } finally {
            setSaving(false)
        }
    }

    const toggleItem = (id: string) => {
        if (!canEdit) return
        setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item))
    }

    const deleteItem = (id: string) => {
        if (!canEdit) return
        setItems(prev => prev.filter(item => item.id !== id))
    }

    const updateQuantity = (id: string, quantity: string) => {
        if (!canEdit) return
        setItems(prev => prev.map(item => item.id === id ? { ...item, quantity } : item))
    }

    const updateItemText = (id: string, text: string) => {
        if (!canEdit) return
        setItems(prev => prev.map(item => item.id === id ? { ...item, text } : item))
    }

    const addItem = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canEdit || !newItemText.trim()) return

        const newItem: DropBagItem = {
            id: `custom_${Date.now()}`,
            text: newItemText.trim(),
            category: 'custom',
            checked: true
        }
        setItems(prev => [...prev, newItem])
        setNewItemText('')
    }

    const itemsByCategory = DROP_BAG_CATEGORIES.reduce((acc, cat) => {
        const catItems = items.filter(i => i.category === cat.id)
        if (catItems.length > 0) acc[cat.id] = catItems
        return acc
    }, {} as Record<string, DropBagItem[]>)

    return (
        <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] animate-in zoom-in-95 duration-200">

                <div className="flex justify-between items-center p-6 border-b border-neutral-800 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            {bagName || (isStartBag ? `Start: ${waypoint.name}` : `${bagNoun}: ${waypoint.name}`)}
                            {!canEdit && <span className="text-xs font-normal text-neutral-500">(view only)</span>}
                        </h2>
                        <div className="flex items-center gap-3 text-sm text-neutral-400">
                            <span>Mile {waypoint.mile.toFixed(1)}</span>
                            {!isStartBag && (
                                <span className={`px-2 py-0.5 rounded border text-xs ${isCrewBag ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200' : 'bg-orange-950/40 border-orange-900/60 text-orange-200'}`}>
                                    {getBagKindLabel(bagKind)}
                                </span>
                            )}
                            {arrivalTime && (
                                <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span className="font-mono text-neutral-200">{arrivalTime.timeOfDay}</span>
                                    <span className="text-neutral-500">Estimated arrival time</span>
                                    {isNight ? <Moon className="w-3 h-3 text-blue-300 ml-1" /> : <Sun className="w-3 h-3 text-yellow-500 ml-1" />}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors bg-neutral-800 hover:bg-neutral-700 p-2 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8 flex-1">

                    {coverageRows.length > 0 && (
                        <div className="bg-neutral-950/50 border border-neutral-800 rounded-xl p-4 space-y-3">
                            <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                                Coverage from this bag
                            </div>
                            <div className="space-y-3">
                                {coverageRows.map(row => (
                                    <div key={row.label} className="flex items-start gap-3 text-xs">
                                        <div className={`w-20 shrink-0 whitespace-nowrap font-bold uppercase tracking-wide ${row.labelClass}`}>
                                            {row.label}
                                        </div>
                                        {row.targetName ? (
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-neutral-200 font-medium">{row.targetName}</span>
                                                    <span className="shrink-0 font-mono text-neutral-500">
                                                        Mile {row.targetMile?.toFixed(1)}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-neutral-400">
                                                    {row.milesUntil !== null && (
                                                        <span className="font-mono">
                                                            +{row.milesUntil.toFixed(1)} mi
                                                        </span>
                                                    )}
                                                    {row.plans.map(plan => (
                                                        <span key={plan.label} className="flex flex-wrap items-baseline gap-x-1.5">
                                                            <span className={`font-mono font-semibold ${plan.colorClass}`}>{plan.timeOfDay ?? '—'}</span>
                                                            <span className="text-neutral-500">Estimated arrival time</span>
                                                            {plan.duration && <span className="text-neutral-500"> · in {plan.duration}</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-neutral-600">None ahead</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {contentsOnly ? (
                    <div className="space-y-5">
                        {bagName && (
                            <div className="bg-neutral-950/50 border border-neutral-800 rounded-xl p-4">
                                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
                                    {bagNameLabel}
                                </div>
                                <div className="text-sm text-white font-medium">{bagName}</div>
                            </div>
                        )}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                {isStartBag ? "What's at the start" : isCrewBag ? "What's at crew handoff" : "What's inside"}
                            </h3>
                            <DropBagSummary waypoint={waypoint} />
                        </div>
                        <DropBagNotes waypoint={waypoint} showEmpty />
                    </div>
                    ) : (
                    <>
                    {(isNight || isHot || isCold) && (
                        <div className="bg-blue-900/20 border border-blue-900/50 rounded-xl p-4 flex gap-3 text-sm">
                            <Info className="w-5 h-5 text-blue-400 shrink-0" />
                            <div>
                                <strong className="text-white block mb-0.5">Smart Suggestions Active</strong>
                                <span className="text-blue-200">
                                    Condition-specific items are added based on estimated arrival time and race weather.
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="bg-neutral-950/50 border border-neutral-800 rounded-xl p-4">
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                            {isStartBag ? 'Start Gear / Identifying Info' : isCrewBag ? 'Crew Bag / Identifying Info' : 'Bag Name / Identifying Info'}
                        </label>
                        <input
                            type="text"
                            value={bagName}
                            onChange={e => setBagName(e.target.value)}
                            readOnly={!canEdit}
                            placeholder={isStartBag ? 'e.g. Start line checklist' : isCrewBag ? 'e.g. Crew tote or soft cooler' : 'e.g. Red Salomon Bag'}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-70"
                        />
                    </div>

                    <div className="space-y-6">
                        {DROP_BAG_CATEGORIES.map(category => {
                            const catItems = itemsByCategory[category.id]
                            if (!catItems) return null

                            const isConditionCat = category.id === 'conditions'

                            return (
                                <div key={category.id} className="space-y-3">
                                    <h3 className={`text-sm font-bold uppercase tracking-wider ${isConditionCat ? 'text-blue-400' : 'text-neutral-500'}`}>
                                        {category.label}
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {catItems.map(item => (
                                            <div
                                                key={item.id}
                                                className={`flex items-center justify-between p-3 rounded-lg border transition-colors group ${item.checked
                                                    ? 'bg-neutral-800/80 border-neutral-700 text-white'
                                                    : 'bg-neutral-950/50 border-neutral-800 text-neutral-400 hover:bg-neutral-900'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleItem(item.id)}
                                                        disabled={!canEdit}
                                                        className={`${canEdit ? 'cursor-pointer' : 'cursor-default'} shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:opacity-100`}
                                                        aria-label={item.checked ? 'Mark item unpacked' : 'Mark item packed'}
                                                    >
                                                        {item.checked ? (
                                                            <CheckCircle2 className="w-5 h-5 text-orange-500" />
                                                        ) : (
                                                            <Circle className="w-5 h-5 text-neutral-600 group-hover:text-neutral-400" />
                                                        )}
                                                    </button>
                                                    {canEdit ? (
                                                        <input
                                                            type="text"
                                                            value={item.text}
                                                            onChange={(e) => updateItemText(item.id, e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') e.currentTarget.blur()
                                                            }}
                                                            placeholder="Item name"
                                                            className={`min-w-0 flex-1 bg-transparent border border-transparent rounded px-1 py-0.5 text-sm focus:outline-none focus:bg-neutral-950 focus:border-orange-500 ${item.checked ? 'text-neutral-100' : 'text-neutral-400'}`}
                                                        />
                                                    ) : (
                                                        <span className={`min-w-0 flex-1 ${item.checked ? 'text-neutral-500' : ''}`}>{item.text}</span>
                                                    )}
                                                </div>

                                                {item.checked && (
                                                    <input
                                                        type="text"
                                                        placeholder="Qty"
                                                        value={item.quantity || ''}
                                                        onChange={(e) => updateQuantity(item.id, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        readOnly={!canEdit}
                                                        className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-orange-500 mx-2 text-white"
                                                    />
                                                )}

                                                {canEdit && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteItem(item.id) }}
                                                        className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 p-1 rounded transition-all shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {canEdit && (
                        <div className="pt-4 border-t border-neutral-800">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-3">Add Custom Item</h3>
                            <form onSubmit={addItem} className="flex gap-2">
                                <input
                                    type="text"
                                    value={newItemText}
                                    onChange={e => setNewItemText(e.target.value)}
                                    placeholder="Add custom item (e.g. Magic Noodle Soup)"
                                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={!newItemText.trim()}
                                    className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Add
                                </button>
                            </form>
                        </div>
                    )}

                    <div className="pt-4 border-t border-neutral-800 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                                {isStartBag ? 'Start Notes & Instructions' : isCrewBag ? 'Crew Bag Notes & Instructions' : 'Drop Bag Notes & Instructions'}
                            </label>
                            <textarea
                                value={bagNotes}
                                onChange={e => setBagNotes(e.target.value)}
                                readOnly={!canEdit}
                                placeholder={isStartBag ? 'e.g. Final checklist before leaving the start...' : isCrewBag ? 'e.g. Hand off ice, poles, or a dry shirt here...' : 'e.g. Change shoes here, grab headlamp for next section...'}
                                rows={2}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 transition-colors resize-y"
                            />
                        </div>
                        <DropBagNotes waypoint={waypoint} showDropBagNotes={false} />
                    </div>
                    </>
                    )}

                </div>

                <div className="p-6 border-t border-neutral-800 flex justify-end gap-3 shrink-0 bg-neutral-900/80 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-lg font-medium text-neutral-400 hover:text-white transition-colors"
                        disabled={saving}
                    >
                        {canEdit && !contentsOnly ? 'Cancel' : 'Close'}
                    </button>
                    {canEdit && !contentsOnly && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`${isCrewBag ? 'bg-emerald-700 hover:bg-emerald-600 shadow-emerald-950/30' : 'bg-orange-600 hover:bg-orange-500 shadow-orange-900/20'} text-white px-8 py-2.5 rounded-lg font-bold transition-all shadow-lg flex items-center gap-2`}
                        >
                            {saving ? (
                                <><Clock className="w-4 h-4 animate-spin" /> Saving...</>
                            ) : (
                                <><Save className="w-4 h-4" /> Save {bagNoun}</>
                            )}
                        </button>
                    )}
                </div>

                </div>
            </div>
        </div>
    )
}
