import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('EditRaceModal.tsx', import.meta.url), 'utf8')

describe('Race Settings resource preservation', () => {
  it('does not write the full Resources config unless the registration label changed', () => {
    expect(source).toContain('const registrationLabelChanged =')
    expect(source).toContain('if (registrationLabelChanged)')
    expect(source).toContain(".select('resources_config')")

    const racePatchBody = source.match(/const racePatch = \{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
    expect(racePatchBody).not.toContain('resources_config')
  })
})
