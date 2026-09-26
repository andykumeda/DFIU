import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Race, Waypoint } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2, X, Settings2 } from 'lucide-react'
import {
    clearDropBagChecklistItems,
    DROP_BAG_CATEGORIES,
    DropBagTemplateItem,
    DropBagTemplateTextField,
    parseDropBagTemplate,
    parseDropBagTemplateTextFields,
} from './drop-bag-shared'
import { useDemoRacePersist } from '@/features/demo/useDemoRacePersist'

interface DropBagTemplateEditorProps {
    race: Race
    canEdit: boolean
    waypoints: Waypoint[]
    bagWaypointIds: string[]
}

export function DropBagTemplateEditor({ race, canEdit, waypoints, bagWaypointIds }: DropBagTemplateEditorProps) {
    const queryClient = useQueryClient()
    const { isDemoMode, saveRacePatch, saveWaypoints } = useDemoRacePersist(race.id)
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState<DropBagTemplateItem[]>(() => parseDropBagTemplate(race.drop_bag_template))
    const [textFields, setTextFields] = useState<DropBagTemplateTextField[]>(() => parseDropBagTemplateTextFields(race.drop_bag_template))
    const [newText, setNewText] = useState('')
    const [newCategory, setNewCategory] = useState('hydration')
    const [newFieldLabel, setNewFieldLabel] = useState('')
    const [newFieldDefault, setNewFieldDefault] = useState('')
    const [saving, setSaving] = useState(false)

    const openEditor = () => {
        setItems(parseDropBagTemplate(race.drop_bag_template))
        setTextFields(parseDropBagTemplateTextFields(race.drop_bag_template))
        setNewFieldLabel('')
        setNewFieldDefault('')
        setOpen(true)
    }

    const handleSave = async (replaceAllBags = false) => {
        if (replaceAllBags && !window.confirm('Replace every existing bag checklist and template text field with this template? Checked items, quantities, custom items, and per-bag text field edits will be cleared. Bag names and bag notes will remain.')) return
        if (newFieldDefault.trim() && !newFieldLabel.trim()) {
            alert('Enter a label for the new text field before saving.')
            return
        }
        setSaving(true)
        try {
            const pendingItem: DropBagTemplateItem[] = newText.trim()
                ? [{ id: `template_${crypto.randomUUID()}`, text: newText.trim(), category: newCategory }]
                : []
            const pendingField: DropBagTemplateTextField[] = newFieldLabel.trim()
                ? [{ id: `text_${crypto.randomUUID()}`, label: newFieldLabel.trim(), defaultText: newFieldDefault }]
                : []
            const template = [...items, ...pendingItem]
                .map(item => ({ ...item, text: item.text.trim() }))
                .filter(item => item.text)
            const savedTextFields = [...textFields, ...pendingField]
                .map(field => ({ ...field, label: field.label.trim() }))
                .filter(field => field.label)
            const savedTemplate = savedTextFields.length ? { items: template, textFields: savedTextFields } : template
            if (isDemoMode) {
                await saveRacePatch({ drop_bag_template: savedTemplate as unknown as Race['drop_bag_template'] })
                if (replaceAllBags && waypoints[0]) {
                    await saveWaypoints(waypoints[0].course_id, clearDropBagChecklistItems(waypoints, bagWaypointIds))
                }
                setOpen(false)
                return
            }
            const { error } = await supabase.from('races')
                .update({ drop_bag_template: savedTemplate as unknown as Race['drop_bag_template'] })
                .eq('id', race.id)
                .select('id')
                .single()
            if (error) throw error
            if (replaceAllBags && bagWaypointIds.length > 0) {
                const { data: resetRows, error: bagError } = await supabase.from('waypoints')
                    .update({ drop_bag_items: null })
                    .in('id', bagWaypointIds)
                    .select('id')
                if (bagError) throw bagError
                if (resetRows.length !== bagWaypointIds.length) throw new Error(`Only ${resetRows.length} of ${bagWaypointIds.length} bag checklists were replaced.`)
                const courseIds = [...new Set(waypoints.map(waypoint => waypoint.course_id))]
                courseIds.forEach(courseId => queryClient.invalidateQueries({ queryKey: ['waypoints', courseId] }))
            }
            queryClient.invalidateQueries({ queryKey: ['race', race.id] })
            setOpen(false)
        } catch (err) {
            console.error('Failed to save drop bag template:', err)
            alert('Failed to save drop bag template')
        } finally {
            setSaving(false)
        }
    }

    if (!canEdit) return null

    return (
        <>
            <button
                onClick={openEditor}
                className="print:hidden flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
                <Settings2 className="w-4 h-4" />
                Edit Template
            </button>

            {open && createPortal(
                <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 backdrop-blur-sm">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]">
                            <div className="flex justify-between items-center gap-3 p-4 sm:p-6 border-b border-neutral-800 shrink-0">
                                <div className="min-w-0">
                                    <h2 className="text-xl font-bold text-white">Drop Bag Template</h2>
                                    <p className="text-sm text-neutral-400 mt-1">
                                        Shared checklist and text fields for every bag. Save preserves per-bag edits; replace resets bag contents and text fields to this template.
                                    </p>
                                </div>
                                <button onClick={() => setOpen(false)} aria-label="Close template editor" className="shrink-0 text-neutral-500 hover:text-white p-2 rounded-lg bg-neutral-800">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="min-h-0 p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 space-y-3">
                                {items.map((item, idx) => (
                                    <div key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)_auto] items-center gap-2 bg-neutral-950/50 border border-neutral-800 rounded-lg p-2">
                                        <input
                                            type="text"
                                            value={item.text}
                                            onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, text: e.target.value } : it))}
                                            className="col-span-2 sm:col-span-1 min-w-0 w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                                        />
                                        <select
                                            value={item.category}
                                            onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, category: e.target.value } : it))}
                                            className="min-w-0 w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                                        >
                                            {DROP_BAG_CATEGORIES.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.label}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                                            className="text-neutral-500 hover:text-red-400 p-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}

                                <form
                                    onSubmit={e => {
                                        e.preventDefault()
                                        if (!newText.trim()) return
                                        setItems(prev => [...prev, { id: `template_${crypto.randomUUID()}`, text: newText.trim(), category: newCategory }])
                                        setNewText('')
                                    }}
                                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)_auto] gap-2 pt-2 border-t border-neutral-800"
                                >
                                    <input
                                        type="text"
                                        value={newText}
                                        onChange={e => setNewText(e.target.value)}
                                        placeholder="Add template item..."
                                        className="col-span-2 sm:col-span-1 min-w-0 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                                    />
                                    <select
                                        value={newCategory}
                                        onChange={e => setNewCategory(e.target.value)}
                                        className="min-w-0 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs text-white"
                                    >
                                        {DROP_BAG_CATEGORIES.filter(c => c.id !== 'conditions').map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                                        ))}
                                    </select>
                                    <button type="submit" className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-lg">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </form>

                                <div className="pt-5 border-t border-neutral-800 space-y-3">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Text fields</h3>
                                    <p className="text-sm text-neutral-500">Each field appears in every bag with default text that can be changed for one bag.</p>
                                    {textFields.map(field => (
                                        <div key={field.id} className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    aria-label="Text field label"
                                                    value={field.label}
                                                    onChange={e => setTextFields(previous => previous.map(item => item.id === field.id ? { ...item, label: e.target.value } : item))}
                                                    placeholder="Field label (e.g. Notes)"
                                                    className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
                                                />
                                                <button type="button" aria-label={`Remove ${field.label || 'text field'}`} onClick={() => setTextFields(previous => previous.filter(item => item.id !== field.id))} className="rounded p-2 text-neutral-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                            <textarea
                                                aria-label={`${field.label || 'Text field'} default text`}
                                                value={field.defaultText}
                                                onChange={e => setTextFields(previous => previous.map(item => item.id === field.id ? { ...item, defaultText: e.target.value } : item))}
                                                placeholder="Default text for every bag"
                                                rows={2}
                                                className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white resize-y"
                                            />
                                        </div>
                                    ))}
                                    <div className="rounded-lg border border-neutral-800 p-3 space-y-2">
                                        <input
                                            type="text"
                                            value={newFieldLabel}
                                            onChange={e => setNewFieldLabel(e.target.value)}
                                            placeholder="New text field label (e.g. Notes)"
                                            className="w-full rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
                                        />
                                        <textarea
                                            value={newFieldDefault}
                                            onChange={e => setNewFieldDefault(e.target.value)}
                                            placeholder="Default text for every bag"
                                            rows={2}
                                            className="w-full rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white resize-y"
                                        />
                                        <button
                                            type="button"
                                            disabled={!newFieldLabel.trim()}
                                            onClick={() => {
                                                if (!newFieldLabel.trim()) return
                                                setTextFields(previous => [...previous, { id: `text_${crypto.randomUUID()}`, label: newFieldLabel.trim(), defaultText: newFieldDefault }])
                                                setNewFieldLabel('')
                                                setNewFieldDefault('')
                                            }}
                                            className="flex items-center gap-2 rounded bg-neutral-800 px-3 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
                                        ><Plus className="h-4 w-4" /> Add Text Field</button>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 sm:p-6 border-t border-neutral-800 flex flex-wrap justify-end gap-3 shrink-0">
                                <button onClick={() => setOpen(false)} className="px-4 py-2 text-neutral-400 hover:text-white" disabled={saving}>
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSave(true)}
                                    disabled={saving || (items.length === 0 && !newText.trim()) || bagWaypointIds.length === 0}
                                    className="border border-red-800 bg-red-950/40 hover:bg-red-900/50 disabled:opacity-50 text-red-200 px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" /> Save &amp; Replace All Bags
                                </button>
                                <button
                                    onClick={() => handleSave(false)}
                                    disabled={saving || (items.length === 0 && !newText.trim())}
                                    className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
