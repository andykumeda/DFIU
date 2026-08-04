// Edge function: strava-activity
//
// Fetches a single Strava activity for the authenticated DFIU user. OAuth
// access/refresh tokens are stored per DFIU user (not per race or race owner)
// in public.strava_connections with RLS and client privileges disabled; they
// are never returned to the app.

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
        return json({
            id: data.id,
            name: typeof data.name === 'string' ? data.name : 'Strava activity',
            elapsedSeconds: Number(data.elapsed_time) || 0,
            movingSeconds: Number(data.moving_time) || 0,
            distanceMiles: Number.isFinite(Number(data.distance)) ? Number(data.distance) / 1609.344 : null,
            startDate: typeof data.start_date === 'string' ? data.start_date : null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load Strava activity'
        const status = error instanceof HttpError ? error.status : 500
        return json({ error: message }, status)
    }
})

function parseActivityId(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return trimmed
    const match = trimmed.match(/strava\.com\/activities\/(\d+)(?:[/?#]|$)/i)
    return match?.[1] ?? null
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
