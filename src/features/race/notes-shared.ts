export type NoteVisibility = 'all' | 'crew' | 'pacer' | 'runner'

export type TodoSectionKey = 'one_month' | 'one_week' | 'night_before'
export type NoteSectionKey = 'personal' | 'crew' | 'pacer'

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

export interface NotesConfig {
  todos: Record<TodoSectionKey, TodoItem[]>
  notes: Record<NoteSectionKey, NoteBlock[]>
}

export const TODO_SECTIONS: Array<{ key: TodoSectionKey; label: string }> = [
  { key: 'one_month', label: 'Todo 1 month before' },
  { key: 'one_week', label: 'Todo 1 week before' },
  { key: 'night_before', label: 'Todo night before' },
]

export const NOTE_SECTIONS: Array<{ key: NoteSectionKey; label: string; defaultVisibility: NoteVisibility }> = [
  { key: 'personal', label: 'Notes (Personal)', defaultVisibility: 'runner' },
  { key: 'crew', label: 'Notes (Crew)', defaultVisibility: 'crew' },
  { key: 'pacer', label: 'Notes (Pacer)', defaultVisibility: 'pacer' },
]

export const NOTE_VISIBILITY_OPTIONS: Array<{ value: NoteVisibility; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'crew', label: 'Crew only' },
  { value: 'pacer', label: 'Pacer only' },
  { value: 'runner', label: 'Runner only' },
]

export function buildDefaultNotesConfig(): NotesConfig {
  return {
    todos: {
      one_month: [],
      one_week: [],
      night_before: [],
    },
    notes: {
      personal: [],
      crew: [],
      pacer: [],
    },
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

function parseTodoList(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseTodoItem).filter((item): item is TodoItem => !!item)
}

function parseNoteList(raw: unknown): NoteBlock[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseNoteBlock).filter((block): block is NoteBlock => !!block)
}

export function parseNotesConfig(raw: unknown): NotesConfig {
  const defaults = buildDefaultNotesConfig()
  if (!raw || typeof raw !== 'object') return defaults

  const config = raw as Partial<NotesConfig>
  const todos = config.todos && typeof config.todos === 'object' ? config.todos : null
  const notes = config.notes && typeof config.notes === 'object' ? config.notes : null

  return {
    todos: {
      one_month: todos ? parseTodoList(todos.one_month) : defaults.todos.one_month,
      one_week: todos ? parseTodoList(todos.one_week) : defaults.todos.one_week,
      night_before: todos ? parseTodoList(todos.night_before) : defaults.todos.night_before,
    },
    notes: {
      personal: notes ? parseNoteList(notes.personal) : defaults.notes.personal,
      crew: notes ? parseNoteList(notes.crew) : defaults.notes.crew,
      pacer: notes ? parseNoteList(notes.pacer) : defaults.notes.pacer,
    },
  }
}

export interface NotesViewerRoles {
  canEdit: boolean
  isRunner: boolean
  isCrew: boolean
  isPacer: boolean
}

/** Editors see everything; others see `all` plus items matching their roles. */
export function canViewNotesItem(visibility: NoteVisibility, roles: NotesViewerRoles): boolean {
  if (roles.canEdit) return true
  if (visibility === 'all') return true
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
  return {
    id: crypto.randomUUID(),
    text: '',
    done: false,
    visibility,
  }
}

export function newNoteBlock(visibility: NoteVisibility = 'all'): NoteBlock {
  return {
    id: crypto.randomUUID(),
    content: '',
    visibility,
  }
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
