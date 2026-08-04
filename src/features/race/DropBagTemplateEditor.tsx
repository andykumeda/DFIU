import { useState } from 'react'
import { Race } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2, X, Settings2 } from 'lucide-react'
import {
    DROP_BAG_CATEGORIES,
    DropBagTemplateItem,
    parseDropBagTemplate,
} from './drop-bag-shared'
import { useDemoRacePersist } from '@/features/demo/useDemoRacePersist'

interface DropBagTemplateEditorProps {
    race: Race
    canEdit: boolean
}

export function DropBagTemplateEditor({ race, canEdit }: DropBagTemplateEditorProps) {
    const queryClient = useQueryClient()
    const { isDemoMode, saveRacePatch } = useDemoRacePersist(race.id)
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState<DropBagTemplateItem[]>(() => parseDropBagTemplate(race.drop_bag_template))
    const [newText, setNewText] = useState('')
    const [newCategory, setNewCategory] = useState('hydration')
    const [saving, setSaving] = useState(false)

    const openEditor = () => {
        setItems(parseDropBagTemplate(race.drop_bag_template))
        setOpen(true)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            if (isDemoMode) {
                await saveRacePatch({ drop_bag_template: items as unknown as Race['drop_bag_template'] })
                setOpen(false)
                return
            }
            const { error } = await (supabase.from('races') as any)
                .update({ drop_bag_template: items })
                .eq('id', race.id)
            if (error) throw error
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

            {open && (
                <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 backdrop-blur-sm">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div className="bg-neutral-900 w-full max-w-2xl rounded-2xl border border-neutral-800 shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]">
                            <div className="flex justify-between items-center p-6 border-b border-neutral-800 shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Drop Bag Template</h2>
                                    <p className="text-sm text-neutral-400 mt-1">
                                        Default checklist for new drop bags. Runners can still customize per aid station.
                                    </p>
                                </div>
                                <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white p-2 rounded-lg bg-neutral-800">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 space-y-3">
                                {items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-neutral-950/50 border border-neutral-800 rounded-lg p-2">
                                        <input
                                            type="text"
                                            value={item.text}
                                            onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, text: e.target.value } : it))}
                                            className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                                        />
                                        <select
                                            value={item.category}
                                            onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, category: e.target.value } : it))}
                                            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
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
                                        setItems(prev => [...prev, { text: newText.trim(), category: newCategory }])
                                        setNewText('')
                                    }}
                                    className="flex gap-2 pt-2 border-t border-neutral-800"
                                >
                                    <input
                                        type="text"
                                        value={newText}
                                        onChange={e => setNewText(e.target.value)}
                                        placeholder="Add template item..."
                                        className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                                    />
                                    <select
                                        value={newCategory}
                                        onChange={e => setNewCategory(e.target.value)}
                                        className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-xs text-white"
                                    >
                                        {DROP_BAG_CATEGORIES.filter(c => c.id !== 'conditions').map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                                        ))}
                                    </select>
                                    <button type="submit" className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-lg">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </form>
                            </div>

                            <div className="p-6 border-t border-neutral-800 flex justify-end gap-3 shrink-0">
                                <button onClick={() => setOpen(false)} className="px-4 py-2 text-neutral-400 hover:text-white" disabled={saving}>
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || items.length === 0}
                                    className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
