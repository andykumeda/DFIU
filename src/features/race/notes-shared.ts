export type NoteVisibility = 'all' | 'crew' | 'pacer' | 'runner'
export type NotesSectionType = 'todo' | 'note'

export interface TodoItem {
  id: string
  text: string
  done: boolean
  visibility: NoteVisibility
}

export interface NoteBlock {
  id: string
  content: string
  visibility: NoteVisibility
}

export interface TodoNotesSection {
  id: string
  title: string
  type: 'todo'
  defaultVisibility: NoteVisibility
  items: TodoItem[]
}

export interface TextNotesSection {
  id: string
  title: string
  type: 'note'
  defaultVisibility: NoteVisibility
  items: NoteBlock[]
}

export type NotesSection = TodoNotesSection | TextNotesSection

export interface NotesConfig {
  sections: NotesSection[]
}

const DEFAULT_SECTION_DEFINITIONS: Array<{
  id: string
  title: string
  type: NotesSectionType
  defaultVisibility: NoteVisibility
}> = [
  { id: 'one_month', title: 'Todo 1 month before', type: 'todo', defaultVisibility: 'all' },
  { id: 'one_week', title: 'Todo 1 week before', type: 'todo', defaultVisibility: 'all' },
  { id: 'night_before', title: 'Todo night before', type: 'todo', defaultVisibility: 'all' },
  { id: 'personal', title: 'Notes (Personal)', type: 'note', defaultVisibility: 'runner' },
  { id: 'crew', title: 'Notes (Crew)', type: 'note', defaultVisibility: 'crew' },
  { id: 'pacer', title: 'Notes (Pacer)', type: 'note', defaultVisibility: 'pacer' },
]

export const NOTE_VISIBILITY_OPTIONS: Array<{ value: NoteVisibility; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'crew', label: 'Crew only' },
  { value: 'pacer', label: 'Pacer only' },
  { value: 'runner', label: 'Runner only' },
]

export function buildDefaultNotesConfig(): NotesConfig {
  return {
    sections: DEFAULT_SECTION_DEFINITIONS.map(section => ({ ...section, items: [] } as NotesSection)),
  }
}

function isVisibility(value: unknown): value is NoteVisibility {
  return value === 'all' || value === 'crew' || value === 'pacer' || value === 'runner'
}

function parseTodoItem(raw: unknown): TodoItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<TodoItem>
  if (typeof item.id !== 'string' || !item.id) return null
  return {
    id: item.id,
    text: typeof item.text === 'string' ? item.text : '',
    done: !!item.done,
    visibility: isVisibility(item.visibility) ? item.visibility : 'all',
  }
}

function parseNoteBlock(raw: unknown): NoteBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const block = raw as Partial<NoteBlock>
  if (typeof block.id !== 'string' || !block.id) return null
  return {
    id: block.id,
    content: typeof block.content === 'string' ? block.content : '',
    visibility: isVisibility(block.visibility) ? block.visibility : 'all',
  }
}

function parseItems<T>(raw: unknown, parser: (value: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parser).filter((item): item is T => item !== null)
}

function parseSections(raw: unknown): NotesSection[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const sections: NotesSection[] = []

  for (const value of raw) {
    if (!value || typeof value !== 'object') continue
    const section = value as Record<string, unknown>
    const id = typeof section.id === 'string' ? section.id.trim() : ''
    const title = typeof section.title === 'string' ? section.title.trim() : ''
    const type = section.type
    if (!id || !title || (type !== 'todo' && type !== 'note') || seen.has(id)) continue
    const defaultVisibility = isVisibility(section.defaultVisibility) ? section.defaultVisibility : 'all'
    sections.push(type === 'todo'
      ? { id, title, type, defaultVisibility, items: parseItems(section.items, parseTodoItem) }
      : { id, title, type, defaultVisibility, items: parseItems(section.items, parseNoteBlock) })
    seen.add(id)
  }

  return sections
}

function parseLegacyConfig(raw: Record<string, unknown>): NotesConfig {
  const todos = raw.todos && typeof raw.todos === 'object' ? raw.todos as Record<string, unknown> : {}
  const notes = raw.notes && typeof raw.notes === 'object' ? raw.notes as Record<string, unknown> : {}
  return {
    sections: DEFAULT_SECTION_DEFINITIONS.map(section => section.type === 'todo'
      ? { ...section, type: 'todo', items: parseItems(todos[section.id], parseTodoItem) }
      : { ...section, type: 'note', items: parseItems(notes[section.id], parseNoteBlock) }),
  }
}

export function parseNotesConfig(raw: unknown): NotesConfig {
  if (!raw || typeof raw !== 'object') return buildDefaultNotesConfig()
  const config = raw as Record<string, unknown>
  if (Array.isArray(config.sections)) return { sections: parseSections(config.sections) }
  return parseLegacyConfig(config)
}

export interface NotesViewerRoles {
  canEdit: boolean
  isRunner: boolean
  isCrew: boolean
  isPacer: boolean
}

export function canViewNotesItem(visibility: NoteVisibility, roles: NotesViewerRoles): boolean {
  if (roles.canEdit || visibility === 'all') return true
  if (visibility === 'crew') return roles.isCrew
  if (visibility === 'pacer') return roles.isPacer
  if (visibility === 'runner') return roles.isRunner
  return false
}

export function filterVisibleTodos(items: TodoItem[], roles: NotesViewerRoles): TodoItem[] {
  return items.filter(item => canViewNotesItem(item.visibility, roles))
}

export function filterVisibleNotes(items: NoteBlock[], roles: NotesViewerRoles): NoteBlock[] {
  return items.filter(item => canViewNotesItem(item.visibility, roles))
}

export function newTodoItem(visibility: NoteVisibility = 'all'): TodoItem {
  return { id: crypto.randomUUID(), text: '', done: false, visibility }
}

export function newNoteBlock(visibility: NoteVisibility = 'all'): NoteBlock {
  return { id: crypto.randomUUID(), content: '', visibility }
}

export function newNotesSection(
  type: NotesSectionType,
  title: string,
  id = `section_${crypto.randomUUID()}`,
): NotesSection {
  return { id, title: title.trim(), type, defaultVisibility: 'all', items: [] } as NotesSection
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
