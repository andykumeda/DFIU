import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (fileName: string) =>
  readFileSync(new URL(fileName, import.meta.url), 'utf8')

describe('race runner profile ownership', () => {
  it('uses the race creator snapshot instead of the signed-in viewer profile', () => {
    const raceDetail = readSource('RaceDetail.tsx')
    const crewView = readSource('CrewView.tsx')

    expect(raceDetail).toContain('useRaceRunnerProfile')
    expect(raceDetail).toContain('runnerProfile={raceRunnerProfile}')
    expect(raceDetail).not.toContain('parseRunnerProfile(profile?.runner_profile)')

    expect(crewView).toContain('useRaceRunnerProfile(raceId)')
    expect(crewView).not.toContain('parseRunnerProfile(profile?.runner_profile)')
  })
})
