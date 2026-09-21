import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OfficialUpdateBanner } from './OfficialUpdateBanner'
import type { OfficialUpdateSection } from './official-update-diff'

const sections: OfficialUpdateSection[] = [{ id: 'terrain', title: 'Terrain', description: 'Changed terrain', changes: ['Difficulty: 110 → 118'] }]

describe('official update notification', () => {
  it('does not advertise an identical-content revision', () => {
    expect(renderToStaticMarkup(createElement(OfficialUpdateBanner, { sections: [], onApply: () => {} }))).toBe('')
  })
  it('does not advertise incomplete comparisons', () => {
    expect(renderToStaticMarkup(createElement(OfficialUpdateBanner, { sections, loading: true, onApply: () => {} }))).toBe('')
  })
  it('still offers review for actual differences', () => {
    expect(renderToStaticMarkup(createElement(OfficialUpdateBanner, { sections, onApply: () => {} }))).toContain('Review changes')
  })
})
