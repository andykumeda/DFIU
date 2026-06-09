export type RunnerProfileLevel = 'weak' | 'average' | 'strong'
export type RunnerPacingStyle = 'fast_start' | 'even' | 'strong_finish'

export interface RunnerPacingProfile {
    climbing: RunnerProfileLevel
    descending: RunnerProfileLevel
    technical: RunnerProfileLevel
    flats: RunnerProfileLevel
    pacingStyle: RunnerPacingStyle
    heat: RunnerProfileLevel
    cold: RunnerProfileLevel
    night: RunnerProfileLevel
    mud: RunnerProfileLevel
    snow: RunnerProfileLevel
    sand: RunnerProfileLevel
    rocky: RunnerProfileLevel
}

export const DEFAULT_RUNNER_PROFILE: RunnerPacingProfile = {
    climbing: 'average',
    descending: 'average',
    technical: 'average',
    flats: 'average',
    pacingStyle: 'even',
    heat: 'average',
    cold: 'average',
    night: 'average',
    mud: 'average',
    snow: 'average',
    sand: 'average',
    rocky: 'average',
}

const levels = new Set<RunnerProfileLevel>(['weak', 'average', 'strong'])
const pacingStyles = new Set<RunnerPacingStyle>(['fast_start', 'even', 'strong_finish'])

function parseLevel(value: unknown): RunnerProfileLevel {
    return levels.has(value as RunnerProfileLevel) ? value as RunnerProfileLevel : 'average'
}

export function parseRunnerProfile(value: unknown): RunnerPacingProfile {
    if (!value || typeof value !== 'object') return { ...DEFAULT_RUNNER_PROFILE }
    const raw = value as Record<string, unknown>
    const pacingStyle = pacingStyles.has(raw.pacingStyle as RunnerPacingStyle)
        ? raw.pacingStyle as RunnerPacingStyle
        : 'even'

    return {
        climbing: parseLevel(raw.climbing),
        descending: parseLevel(raw.descending),
        technical: parseLevel(raw.technical),
        flats: parseLevel(raw.flats),
        pacingStyle,
        heat: parseLevel(raw.heat),
        cold: parseLevel(raw.cold),
        night: parseLevel(raw.night),
        mud: parseLevel(raw.mud),
        snow: parseLevel(raw.snow),
        sand: parseLevel(raw.sand),
        rocky: parseLevel(raw.rocky),
    }
}

export function levelAdjustment(level: RunnerProfileLevel, magnitude: number): number {
    if (level === 'strong') return -magnitude
    if (level === 'weak') return magnitude
    return 0
}
