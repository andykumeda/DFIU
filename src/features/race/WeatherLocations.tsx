import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus, Trash2, RefreshCw, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchWeatherForRace } from '@/lib/weather-service'
import { getCoordinateAtDistance } from '@/lib/geo-utils'
import { formatStoredClockTime } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthContext'
import type { Race, Course } from '@/types/database'

export interface WeatherLocationEntry {
    id: string
    label: string
    query: string
    avg_temp_high: string
    avg_temp_low: string
    precip_chance: string
    sunrise_time: string
    sunset_time: string
    moon_phase: string
    weather_notes: string
}

export function parseWeatherLocations(value: unknown): WeatherLocationEntry[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map((v) => ({
            id: String(v.id ?? crypto.randomUUID()),
            label: String(v.label ?? 'Location'),
            query: String(v.query ?? ''),
            avg_temp_high: String(v.avg_temp_high ?? '--'),
            avg_temp_low: String(v.avg_temp_low ?? '--'),
            precip_chance: String(v.precip_chance ?? '--'),
            sunrise_time: String(v.sunrise_time ?? '--'),
            sunset_time: String(v.sunset_time ?? '--'),
            moon_phase: String(v.moon_phase ?? ''),
            weather_notes: String(v.weather_notes ?? ''),
        }))
}

interface WeatherLocationsProps {
    race: Race
    course: Course | null
    canEdit: boolean
}

export function WeatherLocations({ race, course, canEdit }: WeatherLocationsProps) {
    const { profile } = useAuth() as { profile: { clock_24h?: boolean } | null }
    const clock24h = !!profile?.clock_24h
    const queryClient = useQueryClient()
    const locations = useMemo(() => parseWeatherLocations(race.weather_locations), [race.weather_locations])

    const [adding, setAdding] = useState(false)
    const [label, setLabel] = useState('')
    const [query, setQuery] = useState('')
    const [busyId, setBusyId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Coordinate at the course midway point — used as a sensible default sample
    // since conditions mid-course often differ from the start/finish location.
    const midpoint = useMemo(() => {
        if (!course?.geometry) return null
        const totalMiles = course.total_distance_miles || race.distance_miles || 0
        if (!totalMiles) return null
        const coord = getCoordinateAtDistance(course.geometry as never, (totalMiles * 1609.34) / 2)
        if (!coord) return null
        const [lon, lat] = coord
        return { lat, lon, query: `${lat.toFixed(5)},${lon.toFixed(5)}` }
    }, [course?.geometry, course?.total_distance_miles, race.distance_miles])

    const persist = async (next: WeatherLocationEntry[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: dbError } = await (supabase.from('races') as any)
            .update({ weather_locations: next })
            .eq('id', race.id)
        if (dbError) throw dbError
        queryClient.invalidateQueries({ queryKey: ['race', race.id] })
    }

    const startAdd = () => {
        setError(null)
        setAdding(true)
        if (!label && !query && midpoint) {
            setLabel('Midway Point')
            setQuery(midpoint.query)
        }
    }

    const useMidway = () => {
        if (!midpoint) return
        if (!label) setLabel('Midway Point')
        setQuery(midpoint.query)
    }

    const addLocation = async () => {
        if (!race.start_datetime) {
            setError('Set a race date first to fetch weather.')
            return
        }
        const trimmedQuery = query.trim()
        if (!trimmedQuery) {
            setError('Enter a location (place name or "lat,lon").')
            return
        }
        setBusyId('new')
        setError(null)
        try {
            const result = await fetchWeatherForRace(trimmedQuery, race.start_datetime)
            const entry: WeatherLocationEntry = {
                id: crypto.randomUUID(),
                label: label.trim() || trimmedQuery,
                query: trimmedQuery,
                avg_temp_high: result.current.avg_temp_high,
                avg_temp_low: result.current.avg_temp_low,
                precip_chance: result.current.precip_chance,
                sunrise_time: result.current.sunrise_time,
                sunset_time: result.current.sunset_time,
                moon_phase: result.current.moon_phase,
                weather_notes: result.current.weather_notes,
            }
            await persist([...locations, entry])
            setAdding(false)
            setLabel('')
            setQuery('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch weather for that location.')
        } finally {
            setBusyId(null)
        }
    }

    const refreshLocation = async (entry: WeatherLocationEntry) => {
        if (!race.start_datetime) return
        setBusyId(entry.id)
        setError(null)
        try {
            const result = await fetchWeatherForRace(entry.query, race.start_datetime)
            const updated: WeatherLocationEntry = {
                ...entry,
                avg_temp_high: result.current.avg_temp_high,
                avg_temp_low: result.current.avg_temp_low,
                precip_chance: result.current.precip_chance,
                sunrise_time: result.current.sunrise_time,
                sunset_time: result.current.sunset_time,
                moon_phase: result.current.moon_phase,
                weather_notes: result.current.weather_notes,
            }
            await persist(locations.map((l) => (l.id === entry.id ? updated : l)))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to refresh weather.')
        } finally {
            setBusyId(null)
        }
    }

    const removeLocation = async (id: string) => {
        setBusyId(id)
        try {
            await persist(locations.filter((l) => l.id !== id))
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove location.')
        } finally {
            setBusyId(null)
        }
    }

    if (locations.length === 0 && !canEdit) return null

    return (
        <div className="mt-4 pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-2">
                <div className="text-neutral-500 text-xs uppercase tracking-wider">Other Course Locations</div>
                {canEdit && !adding && (
                    <button
                        onClick={startAdd}
                        className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add location
                    </button>
                )}
            </div>

            {locations.length === 0 && !adding && (
                <p className="text-neutral-600 text-xs">
                    {canEdit
                        ? 'Add sample points along the course (e.g. the midway point or a high pass) for race-day weather.'
                        : null}
                </p>
            )}

            <div className="space-y-1.5">
                {locations.map((loc) => (
                    <div key={loc.id} className="bg-neutral-950/50 px-3 py-2 rounded text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-neutral-300 font-medium truncate flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                {loc.label}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-red-400 font-mono">{loc.avg_temp_high}</span>
                                <span className="text-blue-400 font-mono">{loc.avg_temp_low}</span>
                                <span className="text-neutral-500 font-mono text-xs">{loc.precip_chance}</span>
                                {canEdit && (
                                    <>
                                        <button
                                            onClick={() => refreshLocation(loc)}
                                            disabled={busyId === loc.id}
                                            aria-label="Refresh weather"
                                            className="text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${busyId === loc.id ? 'animate-spin' : ''}`} />
                                        </button>
                                        <button
                                            onClick={() => removeLocation(loc.id)}
                                            disabled={busyId === loc.id}
                                            aria-label="Remove location"
                                            className="text-neutral-500 hover:text-red-400 disabled:opacity-50"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {(loc.sunrise_time !== '--' || loc.weather_notes) && (
                            <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500">
                                {loc.sunrise_time !== '--' && <span>↑ {formatStoredClockTime(loc.sunrise_time, clock24h)}</span>}
                                {loc.sunset_time !== '--' && <span>↓ {formatStoredClockTime(loc.sunset_time, clock24h)}</span>}
                                {loc.weather_notes && <span className="truncate">{loc.weather_notes}</span>}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {adding && canEdit && (
                <div className="mt-2 bg-neutral-950/50 p-3 rounded border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="text-neutral-400 text-xs uppercase tracking-wider">New location</div>
                        <button
                            onClick={() => { setAdding(false); setError(null) }}
                            className="text-neutral-500 hover:text-neutral-300"
                            aria-label="Cancel"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Label (e.g. Midway Point, Summit)"
                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                    />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder='Location: place name or "lat,lon"'
                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                    />
                    <div className="flex items-center gap-2">
                        {midpoint && (
                            <button
                                onClick={useMidway}
                                className="text-xs text-neutral-400 hover:text-white border border-neutral-700 rounded px-2 py-1"
                            >
                                Use course midpoint
                            </button>
                        )}
                        <button
                            onClick={addLocation}
                            disabled={busyId === 'new'}
                            className="ml-auto flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-sm px-3 py-1.5 rounded font-semibold"
                        >
                            {busyId === 'new' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            {busyId === 'new' ? 'Fetching…' : 'Add'}
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
    )
}
