import { SlidersHorizontal, Minus, Plus } from 'lucide-react'
import type { RunnerPacingProfile, RunnerProfileLevel, RunnerPacingStyle } from './runner-profile'
import { AID_STATION_DELAY_MAX, AID_STATION_DELAY_MIN } from './runner-profile'

export function RunnerProfilePanel({
    profile,
    canEdit,
    onChange,
}: {
    profile: RunnerPacingProfile
    canEdit: boolean
    onChange: (profile: RunnerPacingProfile) => void
}) {
    const setLevel = (key: keyof RunnerPacingProfile, value: RunnerProfileLevel | RunnerPacingStyle) => {
        if (!canEdit) return
        onChange({ ...profile, [key]: value })
    }

    const setDelay = (next: number) => {
        if (!canEdit) return
        const clamped = Math.min(AID_STATION_DELAY_MAX, Math.max(AID_STATION_DELAY_MIN, next))
        onChange({ ...profile, aidStationDefaultDelay: clamped })
    }

    const levelOptions: { value: RunnerProfileLevel; label: string }[] = [
        { value: 'weak', label: 'Weak' },
        { value: 'average', label: 'Average' },
        { value: 'strong', label: 'Strong' },
    ]

    const rows: { key: keyof RunnerPacingProfile; label: string; help: string }[] = [
        { key: 'climbing', label: 'Climbs', help: 'Uphill grades' },
        { key: 'descending', label: 'Descents', help: 'Downhill running' },
        { key: 'technical', label: 'Technical terrain', help: 'Rough or slow trail' },
        { key: 'flats', label: 'Flats', help: 'Smooth flatter sections' },
        { key: 'night', label: 'Night running', help: 'Dark sections' },
        { key: 'heat', label: 'Heat', help: 'Hot race hours' },
        { key: 'cold', label: 'Cold', help: 'Cold/night conditions' },
        { key: 'altitude', label: 'Altitude', help: 'High elevation / thin air (above ~5,000 ft)' },
        { key: 'mud', label: 'Mud', help: 'Muddy conditions' },
        { key: 'snow', label: 'Snow', help: 'Snow/ice conditions' },
        { key: 'sand', label: 'Sand', help: 'Sandy surfaces' },
        { key: 'rocky', label: 'Rocky', help: 'Rocky surfaces' },
    ]

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-orange-500" /> Runner Profile
            </h2>
            <p className="text-xs text-neutral-500 mb-4">
                These strengths follow you across every race and adjust the pace model along with grade, terrain, daylight, weather, altitude, and fatigue.
            </p>

            <label className="block mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">General pacing</span>
                <select
                    value={profile.pacingStyle}
                    disabled={!canEdit}
                    onChange={(e) => setLevel('pacingStyle', e.target.value as RunnerPacingStyle)}
                    className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                    <option value="fast_start">Fast starter, slower finish</option>
                    <option value="even">Even-paced runner</option>
                    <option value="strong_finish">Slower start, stronger finish</option>
                </select>
            </label>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-center bg-neutral-950/50 border border-neutral-800 rounded-lg px-3 py-2 mb-4">
                <div>
                    <div className="text-sm text-neutral-200">Default aid-station stop</div>
                    <div className="text-[11px] text-neutral-600">Minutes spent at each aid station (per-station overrides live in the pace chart)</div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setDelay(profile.aidStationDefaultDelay - 1)}
                        disabled={!canEdit || profile.aidStationDefaultDelay <= AID_STATION_DELAY_MIN}
                        className="w-7 h-7 flex items-center justify-center rounded bg-neutral-900 border border-neutral-800 text-white hover:bg-neutral-800 disabled:opacity-40"
                        aria-label="Decrease default aid-station stop"
                    >
                        <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-12 text-center text-sm text-white font-mono tabular-nums">{profile.aidStationDefaultDelay}m</span>
                    <button
                        type="button"
                        onClick={() => setDelay(profile.aidStationDefaultDelay + 1)}
                        disabled={!canEdit || profile.aidStationDefaultDelay >= AID_STATION_DELAY_MAX}
                        className="w-7 h-7 flex items-center justify-center rounded bg-neutral-900 border border-neutral-800 text-white hover:bg-neutral-800 disabled:opacity-40"
                        aria-label="Increase default aid-station stop"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                {rows.map(row => (
                    <div key={row.key} className="grid grid-cols-[1fr_auto] gap-3 items-center bg-neutral-950/50 border border-neutral-800 rounded-lg px-3 py-2">
                        <div>
                            <div className="text-sm text-neutral-200">{row.label}</div>
                            <div className="text-[11px] text-neutral-600">{row.help}</div>
                        </div>
                        <select
                            value={profile[row.key] as RunnerProfileLevel}
                            disabled={!canEdit}
                            onChange={(e) => setLevel(row.key, e.target.value as RunnerProfileLevel)}
                            className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-white disabled:opacity-60"
                        >
                            {levelOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                ))}
            </div>
        </div>
    )
}
