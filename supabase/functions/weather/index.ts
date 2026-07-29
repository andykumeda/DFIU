// Edge function: weather
//
// Proxies Visual Crossing Timeline API so VISUAL_CROSSING_KEY stays off the
// client bundle. Requires a valid user JWT (Authorization: Bearer).
//
// Body:
//   { action: 'current', location: string }
//   { action: 'race', location: string, date: string }
//
// Secret: VISUAL_CROSSING_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline'

interface VisualCrossingDay {
    tempmax: number
    tempmin: number
    precip: number
    precipprob: number
    sunrise: string
    sunset: string
    moonphase: number
    conditions: string
    description: string
    normal?: {
        tempmax: [number, number, number]
        tempmin: [number, number, number]
        precip: [number, number, number]
    }
}

interface VisualCrossingResponse {
    days: VisualCrossingDay[]
    resolvedAddress: string
    timezone: string
    tzoffset: number
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const apiKey = Deno.env.get('VISUAL_CROSSING_KEY') ?? ''

        if (!apiKey) {
            return json({ error: 'Visual Crossing API key not configured on server' }, 500)
        }

        const authHeader = req.headers.get('Authorization') ?? ''
        if (!authHeader.startsWith('Bearer ')) {
            return json({ error: 'Missing Authorization' }, 401)
        }

        const caller = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: userData, error: userErr } = await caller.auth.getUser()
        if (userErr || !userData?.user) {
            return json({ error: 'Invalid session' }, 401)
        }

        const body = await req.json()
        const location = typeof body.location === 'string' ? body.location.trim() : ''
        if (!location) return json({ error: 'location required' }, 400)

        if (body.action === 'current') {
            const today = new Date().toISOString().split('T')[0]
            const data = await fetchDay(location, today, apiKey)
            if (!data.days?.length) {
                return json({ error: 'No weather data returned for current conditions' }, 502)
            }
            const d = data.days[0]
            return json({
                high: Math.round(d.tempmax),
                low: Math.round(d.tempmin),
                precipChance: Math.round(d.precipprob),
                conditions: d.conditions,
                asOfDate: today,
            })
        }

        if (body.action === 'race') {
            const dateStr = typeof body.date === 'string' ? body.date : ''
            if (!dateStr) return json({ error: 'date required' }, 400)
            const result = await fetchWeatherForRace(location, dateStr, apiKey)
            return json(result)
        }

        return json({ error: 'Invalid action' }, 400)
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown weather error'
        return json({ error: message }, 400)
    }
})

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

async function fetchDay(location: string, date: string, apiKey: string): Promise<VisualCrossingResponse> {
    const url = `${BASE_URL}/${encodeURIComponent(location)}/${date}/${date}?unitGroup=us&key=${apiKey}&include=days`
    const response = await fetch(url)
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Weather API error (${response.status}): ${text}`)
    }
    return response.json()
}

function getMoonPhaseName(phase: number): string {
    if (phase === 0 || phase === 1) return '🌑 New Moon'
    if (phase < 0.25) return '🌒 Waxing Crescent'
    if (phase === 0.25) return '🌓 First Quarter'
    if (phase < 0.5) return '🌔 Waxing Gibbous'
    if (phase === 0.5) return '🌕 Full Moon'
    if (phase < 0.75) return '🌖 Waning Gibbous'
    if (phase === 0.75) return '🌗 Last Quarter'
    return '🌘 Waning Crescent'
}

function formatTime(isoTime: string): string {
    const [hours, minutes] = isoTime.split(':').map(Number)
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHour = hours % 12 || 12
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

async function fetchWeatherForRace(location: string, dateStr: string, apiKey: string) {
    const raceDate = new Date(dateStr)
    const dateFormatted = raceDate.toISOString().split('T')[0]
    const month = raceDate.getMonth()
    const day = raceDate.getDate()
    const currentYear = new Date().getFullYear()
    const raceYear = raceDate.getFullYear()

    const currentUrl = `${BASE_URL}/${encodeURIComponent(location)}/${dateFormatted}/${dateFormatted}?unitGroup=us&key=${apiKey}&include=days,normal`
    const currentResponse = await fetch(currentUrl)
    if (!currentResponse.ok) {
        const text = await currentResponse.text()
        throw new Error(`Weather API error (${currentResponse.status}): ${text}`)
    }
    const currentData: VisualCrossingResponse = await currentResponse.json()
    if (!currentData.days?.length) {
        throw new Error('No weather data returned for this location and date')
    }

    const todayData = currentData.days[0]
    let normals: { avg_high: number; avg_low: number; avg_precip: number } | null = null
    if (todayData.normal) {
        normals = {
            avg_high: Math.round(todayData.normal.tempmax[1]),
            avg_low: Math.round(todayData.normal.tempmin[1]),
            avg_precip: Math.round(todayData.normal.precip[1] * 100) / 100,
        }
    }

    const raceDayOfWeek = raceDate.getDay()
    const pastYears: number[] = []
    for (let i = 1; i <= 3; i++) {
        const year = raceYear - i
        if (year <= currentYear) pastYears.push(year)
    }

    const pastPromises = pastYears.map(async (year) => {
        try {
            const candidate = new Date(year, month, day)
            let dayDiff = raceDayOfWeek - candidate.getDay()
            if (dayDiff > 3) dayDiff -= 7
            if (dayDiff < -3) dayDiff += 7
            candidate.setDate(candidate.getDate() + dayDiff)
            const pastDate = candidate.toISOString().split('T')[0]
            const data = await fetchDay(location, pastDate, apiKey)
            if (!data.days?.length) return null
            const d = data.days[0]
            return {
                year,
                date: pastDate,
                high: Math.round(d.tempmax),
                low: Math.round(d.tempmin),
                precip: Math.round(d.precip * 100) / 100,
                conditions: d.conditions,
            }
        } catch {
            return null
        }
    })

    const pastResults = (await Promise.all(pastPromises)).filter(Boolean) as Array<{
        year: number
        date: string
        high: number
        low: number
        precip: number
        conditions: string
    }>
    pastResults.sort((a, b) => b.year - a.year)

    return {
        current: {
            avg_temp_high: `${Math.round(todayData.tempmax)}°F`,
            avg_temp_low: `${Math.round(todayData.tempmin)}°F`,
            precip_chance: `${Math.round(todayData.precipprob)}%`,
            sunrise_time: formatTime(todayData.sunrise),
            sunset_time: formatTime(todayData.sunset),
            moon_phase: getMoonPhaseName(todayData.moonphase),
            weather_notes: todayData.conditions,
            timezone: currentData.timezone,
        },
        history: {
            normals,
            past_years: pastResults,
        },
    }
}
