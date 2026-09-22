import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficialUpdateBanner } from './OfficialUpdateBanner'
import { getDefaultOfficialUpdateChangeIds } from './official-update-diff'
import type { OfficialUpdateSection } from './official-update-diff'

const sections: OfficialUpdateSection[] = [{
  id: 'terrain',
  title: 'Terrain',
  description: 'Changed terrain',
  changes: [{
    id: 'terrain.difficulty',
    label: 'Difficulty',
    current: '110',
    official: '118',
    apply: { kind: 'section', section: 'terrain' },
  }],
}]

describe('official update notification', () => {
  it('does not advertise an identical-content revision', () => {
    expect(renderToStaticMarkup(createElement(OfficialUpdateBanner, { sections: [], onApply: () => {} }))).toBe('')
  })
  it('does not advertise incomplete comparisons', () => {
    expect(renderToStaticMarkup(createElement(OfficialUpdateBanner, { sections, loading: true, onApply: () => {} }))).toBe('')
  })
  it('still offers review for actual differences', () => {
    const html = renderToStaticMarkup(createElement(OfficialUpdateBanner, { sections, onApply: () => {} }))
    expect(html).toContain('Review changes')
  })
  it('carries current and official values for side-by-side review', () => {
    expect(sections[0].changes[0].current).toBe('110')
    expect(sections[0].changes[0].official).toBe('118')
  })
  it('leaves likely content downgrades unchecked while selecting normal changes', () => {
    const guardedSections: OfficialUpdateSection[] = [{
      ...sections[0],
      changes: [
        sections[0].changes[0],
        {
          id: 'resources.link.notes.content',
          label: 'Runner Notes — content',
          current: 'Expanded notes',
          official: 'Old notes',
          apply: { kind: 'resources_link_field', linkKey: 'notes', field: 'content', value: 'Old notes' },
          defaultSelected: false,
        },
      ],
    }]

    expect(getDefaultOfficialUpdateChangeIds(guardedSections)).toEqual(['terrain.difficulty'])
  })
})
