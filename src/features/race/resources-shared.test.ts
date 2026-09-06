import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeResourceUrl } from './resources-shared'

describe('normalizeResourceUrl', () => {
    it('makes scheme-less resource URLs usable as external links', () => {
        expect(normalizeResourceUrl('www.example.com/guide')).toBe('https://www.example.com/guide')
        expect(normalizeResourceUrl(' example.com/guide ')).toBe('https://example.com/guide')
    })

    it('allows only web URLs', () => {
        expect(normalizeResourceUrl('https://example.com/guide')).toBe('https://example.com/guide')
        expect(normalizeResourceUrl('javascript:alert(1)')).toBeNull()
        expect(normalizeResourceUrl('not a URL')).toBeNull()
        expect(normalizeResourceUrl('')).toBeNull()
    })
})

describe('resource card navigation', () => {
    it('does not force a new browsing context that can become blank on repeat visits', () => {
        const source = readFileSync(new URL('./RaceResources.tsx', import.meta.url), 'utf8')
        expect(source).toContain('href={resourceUrl}')
        expect(source).not.toContain('target="_blank"')
    })
})
