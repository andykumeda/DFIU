import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (fileName: string) =>
  readFileSync(new URL(fileName, import.meta.url), 'utf8')

describe('mobile race tab page boundary', () => {
  it('removes page-level bottom padding from every standard race tab shell on mobile', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
    expect(css).toMatch(/@media\s*\(max-width:\s*639px\)[\s\S]*\.race-tab-page\s*{[\s\S]*padding-bottom:\s*0/)

    for (const fileName of [
      'RaceDetail.tsx',
      'PaceCalculator.tsx',
      'TrainingSection.tsx',
      'DropBagsSection.tsx',
      'RaceResources.tsx',
      'CrewView.tsx',
      'LiveEventTab.tsx',
      'RaceMembersSection.tsx',
    ]) {
      expect(readSource(fileName), `${fileName} should use the shared mobile page boundary`).toContain('race-tab-page')
    }
  })
})
