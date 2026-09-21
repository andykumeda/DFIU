import { describe, expect, it } from 'vitest'
import {
  buildDefaultNotesConfig,
  canViewNotesItem,
  filterVisibleNotes,
  filterVisibleTodos,
  parseNotesConfig,
} from './notes-shared'

describe('parseNotesConfig', () => {
  it('returns empty defaults for null/invalid input', () => {
    expect(parseNotesConfig(null)).toEqual(buildDefaultNotesConfig())
    expect(parseNotesConfig('nope')).toEqual(buildDefaultNotesConfig())
  })

  it('parses todos and notes with visibility fallbacks', () => {
    const parsed = parseNotesConfig({
      todos: {
        one_month: [{ id: 't1', text: 'Book lodging', done: true }],
        one_week: [{ id: '', text: 'bad' }],
        night_before: [{ id: 't2', text: 'Pack bags', done: false, visibility: 'runner' }],
      },
      notes: {
        personal: [{ id: 'n1', content: 'Solo focus', visibility: 'runner' }],
        crew: [{ id: 'n2', content: 'Meet at Clear Creek', visibility: 'crew' }],
        pacer: [{ id: 'n3', content: '' }],
      },
    })

    expect(parsed.todos.one_month).toEqual([
      { id: 't1', text: 'Book lodging', done: true, visibility: 'all' },
    ])
    expect(parsed.todos.one_week).toEqual([])
    expect(parsed.todos.night_before[0].visibility).toBe('runner')
    expect(parsed.notes.personal[0].content).toBe('Solo focus')
    expect(parsed.notes.pacer[0]).toEqual({ id: 'n3', content: '', visibility: 'all' })
  })
})

describe('canViewNotesItem', () => {
  it('lets editors see every visibility', () => {
    const editor = { canEdit: true, isRunner: false, isCrew: false, isPacer: false }
    expect(canViewNotesItem('all', editor)).toBe(true)
    expect(canViewNotesItem('crew', editor)).toBe(true)
    expect(canViewNotesItem('pacer', editor)).toBe(true)
    expect(canViewNotesItem('runner', editor)).toBe(true)
  })

  it('filters by membership role for non-editors', () => {
    const crew = { canEdit: false, isRunner: false, isCrew: true, isPacer: false }
    expect(canViewNotesItem('all', crew)).toBe(true)
    expect(canViewNotesItem('crew', crew)).toBe(true)
    expect(canViewNotesItem('pacer', crew)).toBe(false)
    expect(canViewNotesItem('runner', crew)).toBe(false)
  })
})

describe('filter helpers', () => {
  it('filters todo and note lists for the viewer', () => {
    const roles = { canEdit: false, isRunner: true, isCrew: false, isPacer: true }
    const todos = filterVisibleTodos(
      [
        { id: '1', text: 'A', done: false, visibility: 'all' },
        { id: '2', text: 'B', done: false, visibility: 'crew' },
        { id: '3', text: 'C', done: true, visibility: 'pacer' },
        { id: '4', text: 'D', done: false, visibility: 'runner' },
      ],
      roles,
    )
    const notes = filterVisibleNotes(
      [
        { id: 'n1', content: 'x', visibility: 'crew' },
        { id: 'n2', content: 'y', visibility: 'runner' },
      ],
      roles,
    )

    expect(todos.map(t => t.id)).toEqual(['1', '3', '4'])
    expect(notes.map(n => n.id)).toEqual(['n2'])
  })
})
