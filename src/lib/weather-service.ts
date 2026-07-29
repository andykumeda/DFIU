/**
 * Weather Service — client wrapper around the `weather` Edge Function.
 * The Visual Crossing API key lives only in Supabase secrets (VISUAL_CROSSING_KEY).
 */

import { supabase } from '@/lib/supabase'

export interface WeatherData {
    avg_temp_high: string
    avg_temp_low: string
    precip_chance: string
    sunrise_time: string
    sunset_time: string
    moon_phase: string
    weather_notes: string
    timezone: string
}

export interface HistoricalYear {
    year: number
    date: string
    high: number
    low: number
    precip: number
    conditions: string
}

export interface WeatherHistory {
    normals: {
        avg_high: number
        avg_low: number
        avg_precip: number
    } | null
    past_years: HistoricalYear[]
}

export interface FullWeatherResult {
    current: WeatherData
    history: WeatherHistory
}

export interface CurrentConditions {
    high: number
    low: number
    precipChance: number
    conditions: string
    asOfDate: string
}

async function invokeWeather<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('weather', { body })
    if (error) {
        throw new Error(error.message || 'Weather request failed')
    }
    if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Weather request failed')
    }
    return data as T
}

/**
 * Fetch today's conditions at the given location.
 */
export async function fetchCurrentWeather(location: string): Promise<CurrentConditions> {
    return invokeWeather<CurrentConditions>({ action: 'current', location })
}

/**
 * Fetch weather data for a race — forecast/stats + climate normals + past 3 years.
 */
export async function fetchWeatherForRace(location: string, dateStr: string): Promise<FullWeatherResult> {
    return invokeWeather<FullWeatherResult>({ action: 'race', location, date: dateStr })
}
