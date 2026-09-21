import { useEffect, useState } from 'react'
import { Race } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { useDemoRacePersist } from '@/features/demo/useDemoRacePersist'
import {
  ChevronDown, ChevronUp, Edit2, Plus, Printer, Save, Trash2, X,
} from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import {
  NOTE_SECTIONS,
  NOTE_VISIBILITY_OPTIONS,
  TODO_SECTIONS,
  filterVisibleNotes,
  filterVisibleTodos,
  moveItem,
  newNoteBlock,
  newTodoItem,
  parseNotesConfig,
  type NoteBlock,
  type NoteSectionKey,
  type NoteVisibility,
  type NotesConfig,
  type NotesViewerRoles,
  type TodoItem,
  type TodoSectionKey,
} from './notes-shared'

interface RaceNotesProps {
  race: Race
  canEdit?: boolean
  roles: NotesViewerRoles
  onUpdate: () => void
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  li { margin: .45rem 0; padding-left: 0; }
  .check { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: .5rem; }
  .done { text-decoration: line-through; color: #666; }
  .note-block + .note-block { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid #ddd; }
  h2, h3, h4 { margin: 1.1em 0 .4em; }
  p { margin: .4em 0; }
  a { color: #1d4ed8; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 5px 9px; text-align: left; }
  @media print { body { padding: 0; } }
</style></head><body>
${bodyHtml}
</body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

function VisibilitySelect({
  value,
  onChange,
  id,
}: {
  value: NoteVisibility
  onChange: (value: NoteVisibility) => void
  id: string
}) {
  return (
    <select
      id={id}
      aria-label="Visibility"
      value={value}
      onChange={e => onChange(e.target.value as NoteVisibility)}
      className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:ring-1 focus:ring-blue-500 outline-none"
    >
      {NOTE_VISIBILITY_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

function visibilityBadge(visibility: NoteVisibility) {
  if (visibility === 'all') return null
  const label = NOTE_VISIBILITY_OPTIONS.find(o => o.value === visibility)?.label ?? visibility
  return (
    <span className="text-[10px] uppercase tracking-wide text-neutral-500 border border-neutral-700 rounded px-1.5 py-0.5">
      {label}
    </span>
  )
}

export function RaceNotes({ race, canEdit = false, roles, onUpdate }: RaceNotesProps) {
  const { isDemoMode, saveRacePatch } = useDemoRacePersist(race.id)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<NotesConfig>(() => parseNotesConfig(race.notes_config))

  useEffect(() => {
    if (!isEditing) setConfig(parseNotesConfig(race.notes_config))
  }, [race.notes_config, isEditing])

  const viewerRoles: NotesViewerRoles = {
    canEdit,
    isRunner: roles.isRunner,
    isCrew: roles.isCrew,
    isPacer: roles.isPacer,
  }

  const resetForm = () => setConfig(parseNotesConfig(race.notes_config))

  const handleSave = async () => {
    setLoading(true)
    try {
      const patch = { notes_config: config as unknown as Race['notes_config'] }
      if (isDemoMode) {
        await saveRacePatch(patch)
        onUpdate()
        setIsEditing(false)
        return
      }
      const { error } = await (supabase.from('races') as any)
        .update(patch)
        .eq('id', race.id)
      if (error) throw error
      onUpdate()
      setIsEditing(false)
    } catch (err) {
      console.error(err)
      alert('Failed to save notes.')
    } finally {
      setLoading(false)
    }
  }

  const persistTodoDone = async (section: TodoSectionKey, id: string, done: boolean) => {
    const next = {
      ...config,
      todos: {
        ...config.todos,
        [section]: config.todos[section].map(item => (item.id === id ? { ...item, done } : item)),
      },
    }
    setConfig(next)
    if (isEditing) return

    try {
      const patch = { notes_config: next as unknown as Race['notes_config'] }
      if (isDemoMode) {
        await saveRacePatch(patch)
        onUpdate()
        return
      }
      const { error } = await (supabase.from('races') as any)
        .update(patch)
        .eq('id', race.id)
      if (error) throw error
      onUpdate()
    } catch (err) {
      console.error(err)
      setConfig(parseNotesConfig(race.notes_config))
      alert('Failed to update todo.')
    }
  }

  const updateTodo = (section: TodoSectionKey, id: string, patch: Partial<TodoItem>) => {
    setConfig(prev => ({
      ...prev,
      todos: {
        ...prev.todos,
        [section]: prev.todos[section].map(item => (item.id === id ? { ...item, ...patch } : item)),
      },
    }))
  }

  const updateNote = (section: NoteSectionKey, id: string, patch: Partial<NoteBlock>) => {
    setConfig(prev => ({
      ...prev,
      notes: {
        ...prev.notes,
        [section]: prev.notes[section].map(item => (item.id === id ? { ...item, ...patch } : item)),
      },
    }))
  }

  const printTodoSection = (label: string, items: TodoItem[]) => {
    const list = items.map(item => {
      const mark = item.done ? '☑' : '☐'
      const cls = item.done ? ' class="done"' : ''
      return `<li${cls}><span class="check">${mark}</span>${escapeHtml(item.text || '(empty)')}</li>`
    }).join('')
    printHtmlDocument(
      `${race.name} — ${label}`,
      `<h1>${escapeHtml(label)}</h1><p class="sub">${escapeHtml(race.name)}</p><ul>${list}</ul>`,
    )
  }

  const printNoteSection = (label: string, elementId: string) => {
    const body = document.getElementById(elementId)?.innerHTML ?? ''
    printHtmlDocument(
      `${race.name} — ${label}`,
      `<h1>${escapeHtml(label)}</h1><p class="sub">${escapeHtml(race.name)}</p>${body}`,
    )
  }

  return (
    <div className="race-tab-page max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Notes</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Timed todos and race notes. Visibility controls who on the team can see each item here.
          </p>
        </div>
        {canEdit && !isEditing ? (
          <button
            type="button"
            onClick={() => { resetForm(); setIsEditing(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Edit2 className="w-4 h-4" /> Edit Notes
          </button>
        ) : canEdit && isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setIsEditing(false); resetForm() }}
              className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors text-sm font-medium"
              disabled={loading}
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
              disabled={loading}
            >
              <Save className="w-4 h-4" /> {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        ) : null}
      </div>

      {TODO_SECTIONS.map(section => {
        const allItems = config.todos[section.key]
        const visible = isEditing ? allItems : filterVisibleTodos(allItems, viewerRoles)
        const hasContent = visible.length > 0

        return (
          <section key={section.key} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-white">{section.label}</h3>
              <div className="flex items-center gap-2">
                {!isEditing && hasContent && (
                  <button
                    type="button"
                    onClick={() => printTodoSection(section.label, visible)}
                    className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-medium border border-neutral-700"
                  >
                    <Printer className="w-4 h-4" /> Print
                  </button>
                )}
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({
                      ...prev,
                      todos: {
                        ...prev.todos,
                        [section.key]: [...prev.todos[section.key], newTodoItem('all')],
                      },
                    }))}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-4 h-4" /> Add item
                  </button>
                )}
              </div>
            </div>

            {!hasContent ? (
              <p role="status" className="text-sm text-neutral-500 italic">
                {isEditing ? 'No items yet. Add a checklist item.' : 'No items yet.'}
              </p>
            ) : (
              <ul className="space-y-2" role="list">
                {visible.map(item => {
                  const fullIndex = allItems.findIndex(t => t.id === item.id)
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5"
                    >
                      {isEditing && (
                        <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                          <button
                            type="button"
                            aria-label="Move item up"
                            disabled={fullIndex <= 0}
                            onClick={() => setConfig(prev => ({
                              ...prev,
                              todos: {
                                ...prev.todos,
                                [section.key]: moveItem(prev.todos[section.key], fullIndex, -1),
                              },
                            }))}
                            className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move item down"
                            disabled={fullIndex < 0 || fullIndex >= allItems.length - 1}
                            onClick={() => setConfig(prev => ({
                              ...prev,
                              todos: {
                                ...prev.todos,
                                [section.key]: moveItem(prev.todos[section.key], fullIndex, 1),
                              },
                            }))}
                            className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={!canEdit}
                        aria-label={item.text ? `Mark done: ${item.text}` : 'Mark todo done'}
                        onChange={e => {
                          if (isEditing) updateTodo(section.key, item.id, { done: e.target.checked })
                          else void persistTodoDone(section.key, item.id, e.target.checked)
                        }}
                        className="mt-1.5 rounded border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={item.text}
                              onChange={e => updateTodo(section.key, item.id, { text: e.target.value })}
                              placeholder="Todo item"
                              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <VisibilitySelect
                              id={`todo-vis-${item.id}`}
                              value={item.visibility}
                              onChange={visibility => updateTodo(section.key, item.id, { visibility })}
                            />
                          </>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm ${item.done ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>
                              {item.text || <em className="text-neutral-600">Empty item</em>}
                            </span>
                            {canEdit && visibilityBadge(item.visibility)}
                          </div>
                        )}
                      </div>
                      {isEditing && (
                        <button
                          type="button"
                          aria-label="Delete todo"
                          onClick={() => setConfig(prev => ({
                            ...prev,
                            todos: {
                              ...prev.todos,
                              [section.key]: prev.todos[section.key].filter(t => t.id !== item.id),
                            },
                          }))}
                          className="text-neutral-500 hover:text-red-400 p-1 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      {NOTE_SECTIONS.map(section => {
        const allBlocks = config.notes[section.key]
        const visible = isEditing ? allBlocks : filterVisibleNotes(allBlocks, viewerRoles)
        const hasContent = visible.some(b => b.content.trim()) || (isEditing && visible.length > 0)
        const printId = `notes-section-${section.key}`

        return (
          <section key={section.key} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-white">{section.label}</h3>
              <div className="flex items-center gap-2">
                {!isEditing && hasContent && (
                  <button
                    type="button"
                    onClick={() => printNoteSection(section.label, printId)}
                    className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg transition-colors text-sm font-medium border border-neutral-700"
                  >
                    <Printer className="w-4 h-4" /> Print
                  </button>
                )}
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({
                      ...prev,
                      notes: {
                        ...prev.notes,
                        [section.key]: [...prev.notes[section.key], newNoteBlock(section.defaultVisibility)],
                      },
                    }))}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-4 h-4" /> Add note
                  </button>
                )}
              </div>
            </div>

            {!hasContent ? (
              <p role="status" className="text-sm text-neutral-500 italic">
                {isEditing ? 'No notes yet. Add a Markdown note.' : 'No notes yet.'}
              </p>
            ) : (
              <div id={printId} className="space-y-4">
                {visible.map((block, index) => {
                  const fullIndex = allBlocks.findIndex(b => b.id === block.id)
                  return (
                    <div
                      key={block.id}
                      className={`note-block ${isEditing ? 'rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 space-y-2' : ''}`}
                    >
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex gap-0.5">
                              <button
                                type="button"
                                aria-label="Move note up"
                                disabled={fullIndex <= 0}
                                onClick={() => setConfig(prev => ({
                                  ...prev,
                                  notes: {
                                    ...prev.notes,
                                    [section.key]: moveItem(prev.notes[section.key], fullIndex, -1),
                                  },
                                }))}
                                className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="Move note down"
                                disabled={fullIndex < 0 || fullIndex >= allBlocks.length - 1}
                                onClick={() => setConfig(prev => ({
                                  ...prev,
                                  notes: {
                                    ...prev.notes,
                                    [section.key]: moveItem(prev.notes[section.key], fullIndex, 1),
                                  },
                                }))}
                                className="text-neutral-500 hover:text-white disabled:opacity-30 p-0.5"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>
                            <VisibilitySelect
                              id={`note-vis-${block.id}`}
                              value={block.visibility}
                              onChange={visibility => updateNote(section.key, block.id, { visibility })}
                            />
                            <button
                              type="button"
                              aria-label="Delete note"
                              onClick={() => setConfig(prev => ({
                                ...prev,
                                notes: {
                                  ...prev.notes,
                                  [section.key]: prev.notes[section.key].filter(n => n.id !== block.id),
                                },
                              }))}
                              className="ml-auto text-neutral-500 hover:text-red-400 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <textarea
                            value={block.content}
                            onChange={e => updateNote(section.key, block.id, { content: e.target.value })}
                            placeholder="Markdown notes…"
                            className="w-full min-h-36 bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-sm text-white font-mono focus:ring-1 focus:ring-blue-500 outline-none resize-y"
                          />
                        </>
                      ) : (
                        <div className={index > 0 ? 'pt-4 border-t border-neutral-800' : ''}>
                          {canEdit && (
                            <div className="mb-2">{visibilityBadge(block.visibility)}</div>
                          )}
                          {block.content.trim() ? (
                            <Markdown openLinksInNewTab={false}>{block.content}</Markdown>
                          ) : (
                            <p className="text-neutral-600 italic text-sm">Empty note</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
