// Edge function: strava-activity
//
// Fetches a single Strava activity for the authenticated DFIU user. OAuth
// access/refresh tokens are stored per DFIU user (not per race or race owner)
// in public.strava_connections with RLS and client privileges disabled; they
// are never returned to the app.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { classifyStravaQueryIntent } from "../_shared/strava-query-intent.ts"

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

        const { activity, action, query } = await req.json()

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

        if (action === 'query') {
            return await handleQuery(query, accessToken, connection.athlete_id)
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

async function handleQuery(query: unknown, accessToken: string, athleteId: number): Promise<Response> {
    if (typeof query !== 'string' || !query.trim()) throw new HttpError('Ask a Strava question first', 400)
    const normalized = query.trim().toLowerCase()
    const rawRequest = parseRawApiRequest(query)

    if (rawRequest) return handleApiRequest(rawRequest, accessToken)

    const activityId = parseActivityId(query)

    if (activityId) {
        const activity = await fetchActivity(accessToken, activityId)
        return json({
            kind: 'activity',
            answer: `${activity.name}: ${formatMiles(activity.distanceMiles)} in ${formatMinutes(activity.movingSeconds)} moving time.`,
            activity,
        })
    }

    const intent = classifyStravaQueryIntent(query)

    if (intent === 'zones') {
        const data = await fetchStrava(accessToken, '/athlete/zones')
        return json({ kind: 'zones', answer: 'Here are your configured heart-rate and power zones.', zones: data })
    }

    if (intent === 'profile') {
        const data = await fetchStrava(accessToken, '/athlete') as Record<string, unknown>
        const name = [data.firstname, data.lastname].filter(Boolean).join(' ') || data.username || 'your Strava profile'
        return json({ kind: 'profile', answer: `You are connected as ${name}.`, profile: data })
    }

    if (intent === 'stats') {
        const data = await fetchStrava(accessToken, `/athletes/${athleteId}/stats`)
        return json({ kind: 'stats', answer: 'Here are your recent, year-to-date, and all-time Strava stats.', stats: data })
    }

    if (intent === 'routes') {
        const routeId = query.match(/\broute\s*#?(\d+)\b/i)?.[1]
        if (routeId && normalized.includes('export')) {
            const format = normalized.includes('tcx') ? 'tcx' : 'gpx'
            return handleApiRequest({ method: 'GET', path: `/routes/${routeId}/export_${format}` }, accessToken)
        }
        if (routeId) return handleApiRequest({ method: 'GET', path: `/routes/${routeId}` }, accessToken)
        return handleApiRequest({ method: 'GET', path: '/athlete/routes?page=1&per_page=50' }, accessToken)
    }

    if (intent === 'segments') {
        if (normalized.includes('starred')) {
            return handleApiRequest({ method: 'GET', path: '/segments/starred' }, accessToken)
        }
        const segmentId = query.match(/\bsegment\s*#?(\d+)\b/i)?.[1]
        if (segmentId && normalized.includes('effort')) {
            return handleApiRequest({ method: 'GET', path: `/segments/${segmentId}/all_efforts` }, accessToken)
        }
        if (segmentId) return handleApiRequest({ method: 'GET', path: `/segments/${segmentId}` }, accessToken)
        const bounds = query.match(/(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)/)?.[1]
        if (bounds) return handleApiRequest({ method: 'GET', path: `/segments/explore?bounds=${encodeURIComponent(bounds)}` }, accessToken)
    }

    if (intent === 'activities') {
        const data = await fetchStrava(accessToken, '/athlete/activities?per_page=10&page=1') as unknown[]
        const activities = data.map(item => {
            const value = item as Record<string, unknown>
            return {
                id: Number(value.id),
                name: typeof value.name === 'string' ? value.name : 'Strava activity',
                type: typeof value.type === 'string' ? value.type : undefined,
                distanceMiles: Number.isFinite(Number(value.distance)) ? Number(value.distance) / 1609.344 : null,
                movingSeconds: Number(value.moving_time) || 0,
                startDate: typeof value.start_date === 'string' ? value.start_date : null,
            }
        })
        return json({ kind: 'activities', answer: `Here are your ${activities.length} most recent activities.`, activities })
    }

    throw new HttpError('Try asking about your activities, routes, segments, stats, zones, profile, or a specific Strava activity link.', 400)
}

type RawApiRequest = {
    method: 'GET'
    path: string
}

function parseRawApiRequest(value: string): RawApiRequest | null {
    const match = value.trim().replace(/\s+/g, ' ').match(/^(GET)\s+(\/[^\s]+)$/i)
    if (!match) return null
    const path = match[2]
    if (path.includes('..') || path.includes('//')) throw new HttpError('Invalid Strava API path', 400)
    return { method: 'GET', path }
}

async function handleApiRequest(request: RawApiRequest, accessToken: string): Promise<Response> {
    const response = await fetch(`https://www.strava.com/api/v3${request.path}`, {
        method: request.method,
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 401) throw new HttpError('Reconnect Strava to refresh activity access', 409)
    if (response.status === 403) throw new HttpError('Strava did not allow access to that API resource', 403)
    if (response.status === 404) throw new HttpError('Strava API resource not found', 404)
    if (!response.ok) throw new HttpError(`Strava API returned HTTP ${response.status}`, 502)

    const contentType = response.headers.get('content-type') ?? ''
    const data = contentType.includes('json') ? await response.json() : await response.text()
    return json({
        kind: 'api',
        answer: `${request.method} ${request.path} returned successfully.`,
        data,
    })
}

async function fetchActivity(accessToken: string, activityId: string) {
    const data = await fetchStrava(accessToken, `/activities/${activityId}`) as Record<string, unknown>
    const stream = await getActivityDistanceTimeStream(accessToken, activityId)
    return {
        id: Number(data.id),
        name: typeof data.name === 'string' ? data.name : 'Strava activity',
        elapsedSeconds: Number(data.elapsed_time) || 0,
        movingSeconds: Number(data.moving_time) || 0,
        distanceMiles: Number.isFinite(Number(data.distance)) ? Number(data.distance) / 1609.344 : null,
        startDate: typeof data.start_date === 'string' ? data.start_date : null,
        stream,
    }
}

async function fetchStrava(accessToken: string, path: string): Promise<unknown> {
    const response = await fetch(`https://www.strava.com/api/v3${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 404) throw new HttpError('Strava could not find that resource', 404)
    if (response.status === 401 || response.status === 403) throw new HttpError('Strava did not allow access to that data', 403)
    if (!response.ok) throw new HttpError('Unable to load data from Strava', 502)
    return response.json()
}

function formatMiles(value: number | null): string {
    return value != null && Number.isFinite(value) ? `${value.toFixed(1)} miles` : 'an unknown distance'
}

function formatMinutes(seconds: number): string {
    const minutes = Math.round(Math.max(0, seconds) / 60)
    return `${minutes} minutes`
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
