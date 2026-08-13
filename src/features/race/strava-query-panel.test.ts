import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Ask Strava panel copy', () => {
  it('keeps technical API syntax out of the visible suggestions and guidance', () => {
    const source = readFileSync(new URL('./StravaQueryPanel.tsx', import.meta.url), 'utf8')

    expect(source).toContain('Show my athlete stats')
    expect(source).toContain('Show my saved routes')
    expect(source).toContain('Ask about activities, routes, segments, stats, or a specific activity.')
    expect(source).not.toContain('GET /athlete/routes?page=1&per_page=20')
    expect(source).not.toContain('For unrestricted API access')
  })
})
