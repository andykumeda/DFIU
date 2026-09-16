import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('EditWaypointModal cutoff entry', () => {
    it('does not rely on Safari native time input value capture', () => {
        const source = readFileSync(new URL('./EditWaypointModal.tsx', import.meta.url), 'utf8')

        expect(source).not.toContain('type="time"')
        expect(source).toContain('placeholder="HH:MM"')
        expect(source).toContain('aria-label="Cutoff time in 24-hour format"')
    })
})
