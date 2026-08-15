// Edge function: strava-activity
//
// Fetches Strava activities for the authenticated DFIU user (one activity by
// ID, or a paginated list of tagged races). OAuth access/refresh tokens are
// stored per DFIU user (not per race or race owner) in public.strava_connections
// with RLS and client privileges disabled; they are never returned to the app.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type StravaConnectionRow = {
    user_id: string
    athlete_id: number
    athlete_name: string | null
    access_token: string
    refresh_token: string
    expires_at: string
    scope: string | null
    updated_at: string
}
type Database = {
    public: {
        Tables: {
            strava_connections: {
                Row: StravaConnectionRow
                Insert: StravaConnectionRow
                Update: Partial<StravaConnectionRow>
                Relationships: []
            }
        }
        Views: Record<never, never>
        Functions: Record<never, never>
        Enums: Record<never, never>
        CompositeTypes: Record<never, never>
    }
}

class HttpError extends Error {
    constructor(message: string, readonly status: number) {
        super(message)
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        if (req.method !== 'POST') throw new HttpError('Method not allowed', 405)

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const clientId = Deno.env.get('STRAVA_CLIENT_ID') ?? ''
        const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET') ?? ''
        if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
            throw new HttpError('Strava activity integration is not configured', 503)
        }

        const authHeader = req.headers.get('Authorization') ?? ''
        const jwt = authHeader.replace(/^Bearer\s+/i, '')
        if (!jwt || jwt === authHeader) throw new HttpError('Authentication required', 401)

        const supabaseAdmin = createClient<Database>(supabaseUrl, serviceKey)
        const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(jwt)
        if (userError || !userResult.user) throw new HttpError('Authentication required', 401)

        const { activity, action } = await req.json()

        const { data: connection, error: connectionError } = await supabaseAdmin
            .from('strava_connections')
            .select('athlete_id, athlete_name, access_token, refresh_token, expires_at')
            .eq('user_id', userResult.user.id)
            .maybeSingle()
        if (connectionError) throw connectionError
        if (!connection) {
            throw new HttpError('Connect Strava again before analyzing an activity', 409)
        }

        const accessToken = await getValidAccessToken({
            supabaseAdmin,
            userId: userResult.user.id,
            accessToken: connection.access_token,
            refreshToken: connection.refresh_token,
            expiresAt: connection.expires_at,
            clientId,
            clientSecret,
        })

        if (action === 'connection') {
            let athleteName = connection.athlete_name
            if (!athleteName) {
                const athleteResponse = await fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: `Bearer ${accessToken}` } })
                if (athleteResponse.ok) {
                    const athlete = await athleteResponse.json()
                    athleteName = typeof athlete.username === 'string' && athlete.username.trim()
                        ? athlete.username.trim()
                        : `${athlete.firstname ?? ''} ${athlete.lastname ?? ''}`.trim() || null
                    if (athleteName) await supabaseAdmin.from('strava_connections').update({ athlete_name: athleteName }).eq('user_id', userResult.user.id)
                }
            }
            return json({ connected: true, athleteName: athleteName ?? `Strava athlete ${connection.athlete_id}` })
        }

        if (action === 'list-races') {
            const listed = await listTaggedRaces(accessToken)
            return json(listed)
        }

        const activityId = parseActivityId(activity)
        if (!activityId) throw new HttpError('Enter a valid Strava activity link or ID', 400)

        const activityResponse = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (activityResponse.status === 404) throw new HttpError('Strava activity not found', 404)
        if (activityResponse.status === 401 || activityResponse.status === 403) {
            throw new HttpError('Strava did not allow access to this activity', 403)
        }
        if (!activityResponse.ok) throw new HttpError('Unable to load this Strava activity', 502)

        const data = await activityResponse.json()
        const stream = await getActivityDistanceTimeStream(accessToken, activityId)
        return json({
            id: data.id,
            name: typeof data.name === 'string' ? data.name : 'Strava activity',
            elapsedSeconds: Number(data.elapsed_time) || 0,
            movingSeconds: Number(data.moving_time) || 0,
            distanceMiles: Number.isFinite(Number(data.distance)) ? Number(data.distance) / 1609.344 : null,
            startDate: typeof data.start_date === 'string' ? data.start_date : null,
            stream,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load Strava activity'
        const status = error instanceof HttpError ? error.status : 500
        return json({ error: message }, status)
    }
})

const STRAVA_RACE_WORKOUT_TYPE = 1
const STRAVA_RUNNING_SPORT_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun'])
const LIST_RACES_PER_PAGE = 200
const LIST_RACES_MAX_PAGES = 8
const LIST_RACES_LOOKBACK_SECONDS = 3 * 365 * 24 * 60 * 60

function isTaggedRunningRace(activity: {
    sport_type?: string
    type?: string
    workout_type?: number | null
}): boolean {
    const sport = activity.sport_type || activity.type
    if (!sport || !STRAVA_RUNNING_SPORT_TYPES.has(sport)) return false
    return activity.workout_type === STRAVA_RACE_WORKOUT_TYPE
}

async function listTaggedRaces(accessToken: string): Promise<{
    races: {
        id: number
        name: string
        sportType: string
        startDate: string | null
        distanceMeters: number
        movingSeconds: number
        elapsedSeconds: number
        elevationGainMeters: number
    }[]
    truncated: boolean
    scanned: number
}> {
    const after = Math.floor(Date.now() / 1000) - LIST_RACES_LOOKBACK_SECONDS
    const races: ReturnType<typeof summarizeListedRace>[] = []
    let scanned = 0
    let truncated = false

    for (let page = 1; page <= LIST_RACES_MAX_PAGES; page++) {
        const params = new URLSearchParams({
            per_page: String(LIST_RACES_PER_PAGE),
            page: String(page),
            after: String(after),
        })
        const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (response.status === 401 || response.status === 403) {
            throw new HttpError('Strava did not allow access to your activities', 403)
        }
        if (response.status === 429) throw new HttpError('Strava rate limit reached. Try again in a few minutes.', 429)
        if (!response.ok) throw new HttpError('Unable to load Strava races', 502)

        const pageActivities = await response.json()
        if (!Array.isArray(pageActivities)) throw new HttpError('Unable to load Strava races', 502)
        scanned += pageActivities.length
        for (const activity of pageActivities) {
            const summary = summarizeListedRace(activity)
            if (summary) races.push(summary)
        }
        if (pageActivities.length < LIST_RACES_PER_PAGE) {
            return { races, truncated, scanned }
        }
        if (page === LIST_RACES_MAX_PAGES) truncated = true
    }

    return { races, truncated, scanned }
}

function summarizeListedRace(activity: {
    id?: number
    name?: string
    sport_type?: string
    type?: string
    workout_type?: number | null
    distance?: number
    moving_time?: number
    elapsed_time?: number
    total_elevation_gain?: number
    start_date?: string
    start_date_local?: string
}) {
    if (!isTaggedRunningRace(activity)) return null
    const id = Number(activity.id)
    if (!Number.isFinite(id) || id <= 0) return null
    const sport = activity.sport_type || activity.type || 'Run'
    const start = activity.start_date_local || activity.start_date || null
    return {
        id,
        name: typeof activity.name === 'string' && activity.name.trim() ? activity.name.trim() : 'Strava race',
        sportType: sport,
        startDate: typeof start === 'string' ? start : null,
        distanceMeters: Number(activity.distance) || 0,
        movingSeconds: Number(activity.moving_time) || 0,
        elapsedSeconds: Number(activity.elapsed_time) || 0,
        elevationGainMeters: Number(activity.total_elevation_gain) || 0,
    }
}

function parseActivityId(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return trimmed
    const match = trimmed.match(/strava\.com\/activities\/(\d+)(?:[/?#]|$)/i)
    return match?.[1] ?? null
}

type ActivityDistanceTimeStream = {
    distanceMeters: number[]
    elapsedSeconds: number[]
    moving: boolean[]
}

async function getActivityDistanceTimeStream(accessToken: string, activityId: string): Promise<ActivityDistanceTimeStream | null> {
    // This is intentionally optional: Strava can omit streams for some older
    // or privacy-restricted activities, in which case the client uses its safe
    // moving-time-only distance-weighted fallback.
    const params = new URLSearchParams({
        keys: 'time,distance,moving',
        key_by_type: 'true',
    })
    const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return null

    const streams = await response.json() as Record<string, { data?: unknown }>
    const distanceMeters = numberStream(streams.distance?.data)
    const elapsedSeconds = numberStream(streams.time?.data)
    const moving = booleanStream(streams.moving?.data)
    if (distanceMeters.length < 2 || distanceMeters.length !== elapsedSeconds.length || elapsedSeconds.length !== moving.length) {
        return null
    }
    return { distanceMeters, elapsedSeconds, moving }
}

function numberStream(data: unknown): number[] {
    if (!Array.isArray(data)) return []
    const values = data.map(Number)
    return values.every(Number.isFinite) ? values : []
}

function booleanStream(data: unknown): boolean[] {
    if (!Array.isArray(data)) return []
    return data.map(value => value === true || value === 1 || value === 'true')
}

async function getValidAccessToken(input: {
    supabaseAdmin: SupabaseClient<Database>
    userId: string
    accessToken: string
    refreshToken: string
    expiresAt: string
    clientId: string
    clientSecret: string
}): Promise<string> {
    const expiresAt = new Date(input.expiresAt).getTime()
    if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) return input.accessToken

    const refreshResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: input.clientId,
            client_secret: input.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: input.refreshToken,
        }),
    })
    const tokenData = await refreshResponse.json()
    if (!refreshResponse.ok || !tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_at) {
        throw new HttpError('Reconnect Strava to refresh activity access', 409)
    }

    const { error } = await input.supabaseAdmin
        .from('strava_connections')
        .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: new Date(Number(tokenData.expires_at) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', input.userId)
    if (error) throw error

    return tokenData.access_token
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
