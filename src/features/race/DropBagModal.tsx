import { useState, useEffect } from 'react'
import { Race, Waypoint } from '@/types/database'
import { X, Save, Plus, Trash2, Clock, Sun, Moon, Info, CheckCircle2, Circle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
    DROP_BAG_CATEGORIES,
    DropBagItem,
    DEFAULT_START_BAG_TEMPLATE,
    mergeTemplateIntoItems,
    parseDropBagTemplate,
    seedDropBagItems,
} from './drop-bag-shared'

interface DropBagModalProps {
    waypoint: Waypoint
    race: Race
    arrivalTime?: { arrivalTime: number, timeOfDay: string }
    isNight: boolean
    canEdit?: boolean
    onClose: () => void
}

export function DropBagModal({ waypoint, race, arrivalTime, isNight, canEdit = true, onClose }: DropBagModalProps) {
    const queryClient = useQueryClient()
    const [items, setItems] = useState<DropBagItem[]>([])
    const [newItemText, setNewItemText] = useState('')
    const [saving, setSaving] = useState(false)
    const [bagName, setBagName] = useState(waypoint.drop_bag_name || '')
    const [bagNotes, setBagNotes] = useState(waypoint.drop_bag_notes || '')

    const isHot = parseInt(race.avg_temp_high || '0') >= 80
    const isCold = parseInt(race.avg_temp_low || '100') <= 40
    const isStartBag = waypoint.type === 'start' || waypoint.mile <= 0.01
    const template = isStartBag ? DEFAULT_START_BAG_TEMPLATE : parseDropBagTemplate(race.drop_bag_template)

    useEffect(() => {
        const existingData = waypoint.drop_bag_items as unknown as DropBagItem[]
        if (existingData && Array.isArray(existingData) && existingData.length > 0) {
            setItems(mergeTemplateIntoItems(existingData, template, { isNight, isHot, isCold }))
        } else {
            setItems(seedDropBagItems(template, { isNight, isHot, isCold }))
        }
    }, [waypoint.drop_bag_items, isNight, isHot, isCold, race.drop_bag_template])

    const handleSave = async () => {
        if (!canEdit) return
        setSaving(true)
        try {
            const { error } = await (supabase
                .from('waypoints') as any)
                .update({
                    drop_bag_items: items,
                    drop_bag_name: bagName,
                    drop_bag_notes: bagNotes
                })
                .eq('id', waypoint.id)

            if (error) throw error
            queryClient.invalidateQueries({ queryKey: ['waypoints', waypoint.course_id] })
            onClose()
        } catch (err) {
            console.error('Failed to save drop bag:', err)
            alert('Failed to save drop bag contents')
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
                            {bagName || (isStartBag ? `Start: ${waypoint.name}` : `Drop Bag: ${waypoint.name}`)}
                            {!canEdit && <span className="text-xs font-normal text-neutral-500">(view only)</span>}
                        </h2>
                        <div className="flex items-center gap-3 text-sm text-neutral-400">
                            <span>Mile {waypoint.mile.toFixed(1)}</span>
                            {arrivalTime && (
                                <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                                    <Clock className="w-3.5 h-3.5" />
                                    ETA: {arrivalTime.timeOfDay}
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
                            {isStartBag ? 'Start Gear / Identifying Info' : 'Bag Name / Identifying Info'}
                        </label>
                        <input
                            type="text"
                            value={bagName}
                            onChange={e => setBagName(e.target.value)}
                            readOnly={!canEdit}
                            placeholder={isStartBag ? 'e.g. Start line checklist' : 'e.g. Red Salomon Bag'}
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
                                                    } ${canEdit ? 'cursor-pointer' : ''}`}
                                            >
                                                <div className="flex items-center gap-3 flex-1" onClick={() => toggleItem(item.id)}>
                                                    {item.checked ? (
                                                        <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />
                                                    ) : (
                                                        <Circle className="w-5 h-5 text-neutral-600 group-hover:text-neutral-400 shrink-0" />
                                                    )}
                                                    <span className={item.checked ? 'text-neutral-500' : ''}>{item.text}</span>
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

                    <div className="pt-4 border-t border-neutral-800">
                        <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                            {isStartBag ? 'Start Notes & Instructions' : 'Drop Bag Notes & Instructions'}
                        </label>
                        <textarea
                            value={bagNotes}
                            onChange={e => setBagNotes(e.target.value)}
                            readOnly={!canEdit}
                            placeholder={isStartBag ? 'e.g. Final checklist before leaving the start...' : 'e.g. Change shoes here, grab headlamp for next section...'}
                            rows={2}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 transition-colors resize-y"
                        />
                    </div>

                </div>

                <div className="p-6 border-t border-neutral-800 flex justify-end gap-3 shrink-0 bg-neutral-900/80 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-lg font-medium text-neutral-400 hover:text-white transition-colors"
                        disabled={saving}
                    >
                        {canEdit ? 'Cancel' : 'Close'}
                    </button>
                    {canEdit && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-orange-600 hover:bg-orange-500 text-white px-8 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-orange-900/20 flex items-center gap-2"
                        >
                            {saving ? (
                                <><Clock className="w-4 h-4 animate-spin" /> Saving...</>
                            ) : (
                                <><Save className="w-4 h-4" /> Save Checklist</>
                            )}
                        </button>
                    )}
                </div>

                </div>
            </div>
        </div>
    )
}
