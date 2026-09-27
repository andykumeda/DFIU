import { useEffect, useState } from 'react'
import { Race } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useDemoRacePersist } from '@/features/demo/useDemoRacePersist'
import {
  ChevronDown, ChevronUp, Edit2, Plus, Printer, Save, Trash2, X,
} from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import {
  NOTE_VISIBILITY_OPTIONS,
  filterVisibleNotes,
  filterVisibleTodos,
  getPrintableNotesSections,
  moveItem,
  newNoteBlock,
  newNotesSection,
  newTodoItem,
  parseNotesConfig,
  type NoteBlock,
  type NoteVisibility,
  type NotesConfig,
  type NotesSection,
  type NotesSectionType,
  type NotesViewerRoles,
  type TodoItem,
} from './notes-shared'

interface RaceNotesProps {
  race: Race
  canEdit?: boolean
  roles: NotesViewerRoles
  onUpdate: () => void
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function printHtmlDocument(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) {
    alert('Unable to open the print window. Please allow pop-ups for this site.')
    return
  }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #111; line-height: 1.5; max-width: 720px; margin: 0 auto; padding: 40px 32px; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; }
  .sub { color: #555; margin: 0 0 1.25rem; font-size: .95rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { margin: .45rem 0; }
  .check { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: .5rem; }
  .done { text-decoration: line-through; color: #666; }
  .note-block + .note-block { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid #ddd; }
  h2, h3, h4 { margin: 1.1em 0 .4em; }
  p { margin: .4em 0; }
  a { color: #1d4ed8; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 5px 9px; text-align: left; }
  .print-section + .print-section { break-before: page; page-break-before: always; }
  @media print { body { padding: 0; } }
</style></head><body>${bodyHtml}</body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

function VisibilitySelect({ value, onChange, id }: {
  value: NoteVisibility
  onChange: (value: NoteVisibility) => void
  id: string
}) {
  return (
    <select
      id={id}
      aria-label="Visibility"
      value={value}
      onChange={event => onChange(event.target.value as NoteVisibility)}
      className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:ring-1 focus:ring-blue-500 outline-none"
    >
      {NOTE_VISIBILITY_OPTIONS.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

function visibilityBadge(visibility: NoteVisibility) {
  if (visibility === 'all') return null
  const label = NOTE_VISIBILITY_OPTIONS.find(option => option.value === visibility)?.label ?? visibility
  return <span className="text-[10px] uppercase tracking-wide text-neutral-500 border border-neutral-700 rounded px-1.5 py-0.5">{label}</span>
}

export function RaceNotes({ race, canEdit = false, roles, onUpdate }: RaceNotesProps) {
  const { isDemoMode, saveRacePatch } = useDemoRacePersist(race.id)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<NotesConfig>(() => parseNotesConfig(race.notes_config))
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionType, setNewSectionType] = useState<NotesSectionType>('todo')
  const isEditing = editingSectionId !== null

  useEffect(() => {
    if (!isEditing && !isAddingSection) setConfig(parseNotesConfig(race.notes_config))
  }, [race.notes_config, isEditing, isAddingSection])

  useEffect(() => {
    if (editingSectionId) document.getElementById(`notes-card-${editingSectionId}`)?.scrollIntoView({ block: 'nearest' })
  }, [editingSectionId])

  const viewerRoles: NotesViewerRoles = { canEdit, isRunner: roles.isRunner, isCrew: roles.isCrew, isPacer: roles.isPacer }
  const printableSections = getPrintableNotesSections(config, viewerRoles)
  const resetForm = () => setConfig(parseNotesConfig(race.notes_config))

  const updateSection = (sectionId: string, updater: (section: NotesSection) => NotesSection) => {
    setConfig(previous => ({
      sections: previous.sections.map(section => section.id === sectionId ? updater(section) : section),
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const patch = { notes_config: config as unknown as Race['notes_config'] }
      if (isDemoMode) await saveRacePatch(patch)
      else {
        const { error } = await supabase.from('races').update(patch).eq('id', race.id)
        if (error) throw error
      }
      onUpdate()
      setEditingSectionId(null)
    } catch (error) {
      console.error(error)
      alert('Failed to save notes.')
    } finally {
      setLoading(false)
    }
  }

  const persistTodoDone = async (sectionId: string, itemId: string, done: boolean) => {
    const next: NotesConfig = {
      sections: config.sections.map(section => section.id === sectionId && section.type === 'todo'
        ? { ...section, items: section.items.map(item => item.id === itemId ? { ...item, done } : item) }
        : section),
    }
    setConfig(next)
    if (isEditing) return
    try {
      const patch = { notes_config: next as unknown as Race['notes_config'] }
      if (isDemoMode) await saveRacePatch(patch)
      else {
        const { error } = await supabase.from('races').update(patch).eq('id', race.id)
        if (error) throw error
      }
      onUpdate()
    } catch (error) {
      console.error(error)
      setConfig(parseNotesConfig(race.notes_config))
      alert('Failed to update todo.')
    }
  }

  const addSection = () => {
    if (!newSectionTitle.trim()) return
    const section = newNotesSection(newSectionType, newSectionTitle)
    setConfig(previous => ({ sections: [...previous.sections, section] }))
    setNewSectionTitle('')
    setIsAddingSection(false)
    setEditingSectionId(section.id)
  }

  const printTodoSection = (title: string, items: TodoItem[]) => {
    const list = items.map(item => `<li${item.done ? ' class="done"' : ''}><span class="check">${item.done ? '☑' : '☐'}</span>${escapeHtml(item.text || '(empty)')}</li>`).join('')
    printHtmlDocument(`${race.name} — ${title}`, `<h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(race.name)}</p><ul>${list}</ul>`)
  }

  const printNoteSection = (title: string, elementId: string) => {
    const body = document.getElementById(elementId)?.innerHTML ?? ''
    printHtmlDocument(`${race.name} — ${title}`, `<h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(race.name)}</p>${body}`)
  }

  const printAllNotes = () => {
    const body = printableSections.map(section => {
      const content = section.type === 'todo'
        ? `<ul>${section.items.map(item => `<li${item.done ? ' class="done"' : ''}><span class="check">${item.done ? '☑' : '☐'}</span>${escapeHtml(item.text)}</li>`).join('')}</ul>`
        : document.getElementById(`notes-section-${section.id}`)?.innerHTML ?? ''
      return `<section class="print-section"><h1>${escapeHtml(section.title)}</h1><p class="sub">${escapeHtml(race.name)}</p>${content}</section>`
    }).join('')
    printHtmlDocument(`${race.name} — Notes`, body)
  }

  return (
    <div className="race-tab-page max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Notes</h2>
          <p className="text-sm text-neutral-400 mt-1">Checklists and race notes. Visibility controls who on the team can see each item.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isEditing && !isAddingSection && printableSections.length > 0 && (
            <button type="button" onClick={printAllNotes} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm font-medium border border-neutral-700">
              <Printer className="w-4 h-4" /> Print All
            </button>
          )}
          {canEdit && !isEditing && !isAddingSection ? (
            <button type="button" onClick={() => { resetForm(); setIsAddingSection(true) }} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> Add Note or Checklist
            </button>
          ) : canEdit && isAddingSection ? (
            <button type="button" onClick={() => { setIsAddingSection(false); resetForm() }} className="flex items-center gap-2 px-4 py-2 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg text-sm font-medium">
              <X className="w-4 h-4" /> Cancel
            </button>
          ) : null}
        </div>
      </div>

      {isAddingSection && (
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 sm:p-6 space-y-3" aria-labelledby="add-notes-section-heading">
          <h3 id="add-notes-section-heading" className="text-lg font-bold text-white">Add note or checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <input aria-label="New section title" value={newSectionTitle} onChange={event => setNewSectionTitle(event.target.value)} placeholder="Section title" className="min-w-0 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none" />
            <select aria-label="New section type" value={newSectionType} onChange={event => setNewSectionType(event.target.value as NotesSectionType)} className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="todo">Checklist</option>
              <option value="note">Text note</option>
            </select>
            <button type="button" onClick={addSection} disabled={!newSectionTitle.trim()} className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </section>
      )}

      {isEditing && !config.sections.some(section => section.id === editingSectionId) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-200">
          <span>Section removed. Save to confirm or Cancel to restore it.</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditingSectionId(null); resetForm() }} disabled={loading} className="rounded px-3 py-1.5 text-neutral-300 hover:bg-neutral-800">Cancel</button>
            <button type="button" onClick={handleSave} disabled={loading} className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-500">{loading ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      {config.sections.length === 0 && (
        <p role="status" className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">No note sections yet.{canEdit && !isEditing && !isAddingSection ? ' Select Add Note or Checklist to create one.' : ''}</p>
      )}

      {config.sections.map((section, sectionIndex) => {
        const isEditingSection = editingSectionId === section.id
        const printId = `notes-section-${section.id}`
        const visibleItems = section.type === 'todo'
          ? (isEditingSection ? section.items : filterVisibleTodos(section.items, viewerRoles))
          : (isEditingSection ? section.items : filterVisibleNotes(section.items, viewerRoles))
        const hasContent = section.type === 'todo'
          ? visibleItems.length > 0
          : (visibleItems as NoteBlock[]).some(block => block.content.trim()) || (isEditingSection && visibleItems.length > 0)

        return (
          <section id={`notes-card-${section.id}`} key={section.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              {isEditingSection ? (
                <div className="flex-1 min-w-[14rem] space-y-2">
                  <input
                    aria-label="Section title"
                    value={section.title}
                    onChange={event => updateSection(section.id, current => ({ ...current, title: event.target.value } as NotesSection))}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-lg font-bold text-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <span className="inline-block text-xs text-neutral-500">{section.type === 'todo' ? 'Checklist' : 'Text note'}</span>
                </div>
              ) : <h3 className="text-lg font-bold text-white">{section.title}</h3>}

              <div className="flex items-center gap-2">
                {!isEditingSection && hasContent && (
                  <button type="button" onClick={() => section.type === 'todo' ? printTodoSection(section.title, visibleItems as TodoItem[]) : printNoteSection(section.title, printId)} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium border border-neutral-700">
                    <Printer className="w-4 h-4" /> Print
                  </button>
                )}
                {canEdit && !isEditing && !isAddingSection && (
                  <button type="button" aria-label={`Edit ${section.title}`} onClick={() => { resetForm(); setEditingSectionId(section.id) }} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium border border-neutral-700">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                )}
                {isEditingSection && (
                  <>
                    <button type="button" onClick={() => { setEditingSectionId(null); resetForm() }} className="flex items-center gap-1.5 text-neutral-400 hover:text-white px-2 py-1.5 rounded-lg text-sm font-medium" disabled={loading}>
                      <X className="w-4 h-4" /> Cancel
                    </button>
                    <button type="button" onClick={handleSave} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium" disabled={loading || !section.title.trim()}>
                      <Save className="w-4 h-4" /> {loading ? 'Saving…' : 'Save'}
                    </button>
                  </>
                )}
                {isEditingSection && (
                  <>
                    <button type="button" aria-label="Move section up" disabled={sectionIndex === 0} onClick={() => setConfig(previous => ({ sections: moveItem(previous.sections, sectionIndex, -1) }))} className="text-neutral-500 hover:text-white disabled:opacity-30 p-1"><ChevronUp className="w-4 h-4" /></button>
                    <button type="button" aria-label="Move section down" disabled={sectionIndex === config.sections.length - 1} onClick={() => setConfig(previous => ({ sections: moveItem(previous.sections, sectionIndex, 1) }))} className="text-neutral-500 hover:text-white disabled:opacity-30 p-1"><ChevronDown className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Delete section ${section.title}`} onClick={() => setConfig(previous => ({ sections: previous.sections.filter(candidate => candidate.id !== section.id) }))} className="text-neutral-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>

            {!hasContent ? (
              <p role="status" className="text-sm text-neutral-500 italic">No {section.type === 'todo' ? 'items' : 'notes'} yet.</p>
            ) : section.type === 'todo' ? (
              <ul className="space-y-2" role="list">
                {(visibleItems as TodoItem[]).map(item => {
                  const itemIndex = section.items.findIndex(candidate => candidate.id === item.id)
                  return (
                    <li key={item.id} className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
                      {isEditingSection && (
                        <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                          <button type="button" aria-label="Move item up" disabled={itemIndex === 0} onClick={() => updateSection(section.id, current => current.type === 'todo' ? { ...current, items: moveItem(current.items, itemIndex, -1) } : current)} className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"><ChevronUp className="w-4 h-4" /></button>
                          <button type="button" aria-label="Move item down" disabled={itemIndex === section.items.length - 1} onClick={() => updateSection(section.id, current => current.type === 'todo' ? { ...current, items: moveItem(current.items, itemIndex, 1) } : current)} className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"><ChevronDown className="w-4 h-4" /></button>
                        </div>
                      )}
                      <input type="checkbox" checked={item.done} disabled={!canEdit || (isEditing && !isEditingSection)} aria-label={item.text ? `Mark done: ${item.text}` : 'Mark todo done'} onChange={event => isEditingSection
                        ? updateSection(section.id, current => current.type === 'todo' ? { ...current, items: current.items.map(candidate => candidate.id === item.id ? { ...candidate, done: event.target.checked } : candidate) } : current)
                        : void persistTodoDone(section.id, item.id, event.target.checked)} className="mt-1.5 rounded border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-500" />
                      <div className="flex-1 min-w-0 space-y-2">
                        {isEditingSection ? (
                          <>
                            <input value={item.text} onChange={event => updateSection(section.id, current => current.type === 'todo' ? { ...current, items: current.items.map(candidate => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate) } : current)} placeholder="Todo item" className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none" />
                            <VisibilitySelect id={`todo-vis-${item.id}`} value={item.visibility} onChange={visibility => updateSection(section.id, current => current.type === 'todo' ? { ...current, items: current.items.map(candidate => candidate.id === item.id ? { ...candidate, visibility } : candidate) } : current)} />
                          </>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap"><span className={`text-sm ${item.done ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{item.text || <em className="text-neutral-600">Empty item</em>}</span>{canEdit && visibilityBadge(item.visibility)}</div>
                        )}
                      </div>
                      {isEditingSection && <button type="button" aria-label="Delete todo" onClick={() => updateSection(section.id, current => current.type === 'todo' ? { ...current, items: current.items.filter(candidate => candidate.id !== item.id) } : current)} className="text-neutral-500 hover:text-red-400 p-1 shrink-0"><Trash2 className="w-4 h-4" /></button>}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div id={printId} className="space-y-4">
                {(visibleItems as NoteBlock[]).map((block, blockIndex) => {
                  const itemIndex = section.items.findIndex(candidate => candidate.id === block.id)
                  return (
                    <div key={block.id} className={`note-block ${isEditingSection ? 'rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 space-y-2' : ''}`}>
                      {isEditingSection ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button type="button" aria-label="Move note up" disabled={itemIndex === 0} onClick={() => updateSection(section.id, current => current.type === 'note' ? { ...current, items: moveItem(current.items, itemIndex, -1) } : current)} className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"><ChevronUp className="w-4 h-4" /></button>
                            <button type="button" aria-label="Move note down" disabled={itemIndex === section.items.length - 1} onClick={() => updateSection(section.id, current => current.type === 'note' ? { ...current, items: moveItem(current.items, itemIndex, 1) } : current)} className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"><ChevronDown className="w-4 h-4" /></button>
                            <VisibilitySelect id={`note-vis-${block.id}`} value={block.visibility} onChange={visibility => updateSection(section.id, current => current.type === 'note' ? { ...current, items: current.items.map(candidate => candidate.id === block.id ? { ...candidate, visibility } : candidate) } : current)} />
                            <button type="button" aria-label="Delete note" onClick={() => updateSection(section.id, current => current.type === 'note' ? { ...current, items: current.items.filter(candidate => candidate.id !== block.id) } : current)} className="ml-auto text-neutral-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <textarea value={block.content} onChange={event => updateSection(section.id, current => current.type === 'note' ? { ...current, items: current.items.map(candidate => candidate.id === block.id ? { ...candidate, content: event.target.value } : candidate) } : current)} placeholder="Markdown notes…" className="w-full min-h-36 bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-sm text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none resize-y" />
                        </>
                      ) : (
                        <div className={blockIndex > 0 ? 'pt-4 border-t border-neutral-800' : ''}>
                          {canEdit && <div className="mb-2">{visibilityBadge(block.visibility)}</div>}
                          {block.content.trim() ? <Markdown openLinksInNewTab={false}>{block.content}</Markdown> : <p className="text-neutral-600 italic text-sm">Empty note</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {isEditingSection && (
              <button
                type="button"
                onClick={() => updateSection(section.id, current => current.type === 'todo'
                  ? { ...current, items: [...current.items, newTodoItem(current.defaultVisibility)] }
                  : { ...current, items: [...current.items, newNoteBlock(current.defaultVisibility)] })}
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
              >
                <Plus className="w-4 h-4" /> {section.type === 'todo' ? 'Add item' : 'Add note'}
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}
