import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDefaultResourcesConfig, normalizeResourceUrl, parseResourcesConfig, reorderResourceLinks } from './resources-shared'
import type { Race } from '@/types/database'

const race = { registration_url: 'https://example.com/register' } as Race

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

describe('registration button label', () => {
    it('defaults to Register Now and trims a saved custom label', () => {
        expect(buildDefaultResourcesConfig(race).registration_label).toBe('Register Now')
        expect(parseResourcesConfig({ links: [], registration_label: '  Register on RunSignup  ' }, race).registration_label)
            .toBe('Register on RunSignup')
    })

    it('falls back when the saved label is blank', () => {
        expect(parseResourcesConfig({ links: [], registration_label: '   ' }, race).registration_label)
            .toBe('Register Now')
    })
})

describe('resource card navigation', () => {
    it('does not force a new browsing context that can become blank on repeat visits', () => {
        const source = readFileSync(new URL('./RaceResources.tsx', import.meta.url), 'utf8')
        expect(source).toContain('href={resourceUrl}')
        expect(source).not.toContain('target="_blank"')
        expect(source).toContain('<Markdown openLinksInNewTab={false}>')
    })
})

describe('resource ordering', () => {
    it('moves a link across a text resource in the saved array order', () => {
        const links = buildDefaultResourcesConfig(race).links.slice(0, 2)
        const mixed = [links[0], { ...links[0], id: 'text', kind: 'text' as const }, links[1]]
        expect(reorderResourceLinks(mixed, links[1].id, links[0].id).map(link => link.id))
            .toEqual([links[1].id, links[0].id, 'text'])
        expect(mixed.map(link => link.id)).toEqual([links[0].id, 'text', links[1].id])
    })
})
