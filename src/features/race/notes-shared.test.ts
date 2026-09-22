import { describe, expect, it } from 'vitest'
import {
  buildDefaultNotesConfig,
  canViewNotesItem,
  filterVisibleNotes,
  filterVisibleTodos,
  newNotesSection,
  parseNotesConfig,
} from './notes-shared'

describe('parseNotesConfig', () => {
  it('returns the six default editable sections for null or invalid input', () => {
    expect(parseNotesConfig(null)).toEqual(buildDefaultNotesConfig())
    expect(parseNotesConfig('nope')).toEqual(buildDefaultNotesConfig())
  })

  it('migrates the original fixed todo and note records into ordered sections', () => {
    const parsed = parseNotesConfig({
      todos: {
        one_month: [{ id: 't1', text: 'Book lodging', done: true }],
        night_before: [{ id: 't2', text: 'Pack bags', done: false, visibility: 'runner' }],
      },
      notes: {
        personal: [{ id: 'n1', content: 'Solo focus', visibility: 'runner' }],
        crew: [{ id: 'n2', content: 'Meet at Clear Creek', visibility: 'crew' }],
      },
    })

    expect(parsed.sections.map(section => [section.id, section.type, section.title])).toEqual([
      ['one_month', 'todo', 'Todo 1 month before'],
      ['one_week', 'todo', 'Todo 1 week before'],
      ['night_before', 'todo', 'Todo night before'],
      ['personal', 'note', 'Notes (Personal)'],
      ['crew', 'note', 'Notes (Crew)'],
      ['pacer', 'note', 'Notes (Pacer)'],
    ])
    expect(parsed.sections[0].items).toEqual([
      { id: 't1', text: 'Book lodging', done: true, visibility: 'all' },
    ])
    expect(parsed.sections[3].items).toEqual([
      { id: 'n1', content: 'Solo focus', visibility: 'runner' },
    ])
  })

  it('parses saved custom sections and removes invalid or duplicate sections', () => {
    const parsed = parseNotesConfig({
      sections: [
        { id: 'travel', title: 'Travel', type: 'todo', items: [{ id: 't1', text: 'Fuel car', done: false }] },
        { id: 'strategy', title: 'Race strategy', type: 'note', defaultVisibility: 'runner', items: [{ id: 'n1', content: 'Stay easy', visibility: 'runner' }] },
        { id: 'travel', title: 'Duplicate', type: 'note', items: [] },
        { id: '', title: 'Invalid', type: 'todo', items: [] },
      ],
    })

    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0]).toMatchObject({ id: 'travel', title: 'Travel', type: 'todo' })
    expect(parsed.sections[1]).toMatchObject({ id: 'strategy', title: 'Race strategy', type: 'note', defaultVisibility: 'runner' })
  })
})

describe('newNotesSection', () => {
  it('creates the selected section type with an editable title and no items', () => {
    expect(newNotesSection('todo', 'Race morning', 'section_1')).toEqual({
      id: 'section_1', title: 'Race morning', type: 'todo', defaultVisibility: 'all', items: [],
    })
    expect(newNotesSection('note', 'Nutrition plan', 'section_2')).toEqual({
      id: 'section_2', title: 'Nutrition plan', type: 'note', defaultVisibility: 'all', items: [],
    })
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
    expect(filterVisibleTodos([
      { id: '1', text: 'A', done: false, visibility: 'all' },
      { id: '2', text: 'B', done: false, visibility: 'crew' },
      { id: '3', text: 'C', done: true, visibility: 'pacer' },
      { id: '4', text: 'D', done: false, visibility: 'runner' },
    ], roles).map(item => item.id)).toEqual(['1', '3', '4'])
    expect(filterVisibleNotes([
      { id: 'n1', content: 'x', visibility: 'crew' },
      { id: 'n2', content: 'y', visibility: 'runner' },
    ], roles).map(item => item.id)).toEqual(['n2'])
  })
})
