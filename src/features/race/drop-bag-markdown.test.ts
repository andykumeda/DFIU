import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DropBagCrewSection } from './DropBagCrewSection'
import { DropBagTextFields } from './DropBagTextFields'

const source = '**Take headlamp**\n\n* Water\n* Poles\n\n[Plan](https://example.com)'

describe('bag freeform Markdown', () => {
    it('renders existing crew notes and template text as bold, lists, and safe links', () => {
        const views = [
            createElement(DropBagCrewSection, { items: [], notes: source }),
            createElement(DropBagTextFields, { fields: [{ id: 'note', type: 'text', templateId: 'note', templateDefaultText: source, defaultText: source, label: 'Notes', value: source }] }),
        ]
        for (const view of views) {
            const html = renderToStaticMarkup(view)
            expect(html).toContain('<strong')
            expect(html).toContain('<ul')
            expect(html).toContain('href="https://example.com"')
            expect(html).not.toContain('**Take headlamp**')
        }
    })
    it('does not execute raw HTML or unsafe links in saved notes', () => {
        const html = renderToStaticMarkup(createElement(DropBagCrewSection, {
            items: [], notes: '<script>alert(1)</script>\n\n[unsafe](javascript:alert)',
        }))
        expect(html).not.toContain('<script>')
        expect(html).not.toContain('href="javascript:')
    })
})
