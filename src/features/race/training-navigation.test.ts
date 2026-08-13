import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { trainingRouteListSearch } from './training-navigation'

describe('training route navigation', () => {
  it('removes only the selected training route from the current query string', () => {
    expect(trainingRouteListSearch('?share=crew-link&demo=1&training=route-123')).toBe(
      '?share=crew-link&demo=1',
    )
  })

  it('keeps the list reset isolated from later card navigation', () => {
    const source = readFileSync(new URL('./TrainingSection.tsx', import.meta.url), 'utf8')
    const resetEffect = source.match(
      /useEffect\(\(\) => \{\s*if \(!resetToken\)[\s\S]*?\}, \[([^\]]+)\]\)/,
    )

    expect(source).toContain('setSelectedId(id)')
    expect(resetEffect, 'TrainingSection should keep a one-shot local reset').not.toBeNull()
    expect(resetEffect?.[1].split(',').map(dependency => dependency.trim())).toEqual([
      'resetToken',
    ])
  })
})
