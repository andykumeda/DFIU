// Edge function: strava-auth
//
// OAuth start/callback for Strava login/signup. Gateway JWT verification stays
// off because both actions run before a Supabase session exists. CSRF is
// mitigated with an HMAC-signed `state` that the client also mirrors in
// sessionStorage. The signed `connect` mode binds a Strava account to the
// current DFIU user only; it never uses the event owner's identity.
//
// Secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Optional STRAVA_STATE_SECRET (falls back to
// service role key for HMAC).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STATE_TTL_MS = 15 * 60 * 1000
type OAuthMode = 'connect' | 'login'
type OAuthState = { mode: OAuthMode }
type StravaConnectionInsert = {
    user_id: string
    athlete_id: number
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
                Row: StravaConnectionInsert
                Insert: StravaConnectionInsert
                Update: Partial<StravaConnectionInsert>
                Relationships: []
            }
        }
        Views: Record<never, never>
        Functions: Record<never, never>
        Enums: Record<never, never>
        CompositeTypes: Record<never, never>
    }
}
type SupabaseAdmin = SupabaseClient<Database>

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const clientId = Deno.env.get('STRAVA_CLIENT_ID')
        const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')
        const stateSecret = Deno.env.get('STRAVA_STATE_SECRET') || serviceKey

        if (!clientId || !clientSecret) {
            throw new Error('Missing Strava configuration')
        }
        if (!supabaseUrl || !serviceKey) {
            throw new Error('Missing Supabase configuration')
        }

        const supabaseAdmin = createClient<Database>(supabaseUrl, serviceKey)
        const { action, redirectUrl, code, state, mode } = await req.json()

        if (action === 'start') {
            if (!redirectUrl || typeof redirectUrl !== 'string') {
                throw new Error('redirectUrl required')
            }
            const oauthMode: OAuthMode = mode === 'connect' ? 'connect' : 'login'
            const oauthState = await signState(stateSecret, crypto.randomUUID(), oauthMode)
            const scope = 'activity:read_all,profile:read_all'
            const params = new URLSearchParams({
                client_id: clientId,
                response_type: 'code',
                redirect_uri: redirectUrl,
                approval_prompt: 'auto',
                scope,
                state: oauthState,
            })
            const url = `https://www.strava.com/oauth/authorize?${params.toString()}`
            return json({ url, state: oauthState })
        }

        if (action === 'callback') {
            if (!code || typeof code !== 'string') {
                throw new Error('code required')
            }
            if (!state || typeof state !== 'string') {
                throw new Error('state required')
            }
            const oauthState = await verifyState(stateSecret, state)
            if (!oauthState) {
                throw new Error('Invalid or expired OAuth state')
            }

            const tokenResp = await fetch('https://www.strava.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                }),
            })

            const tokenData = await tokenResp.json()
            if (!tokenResp.ok || tokenData.errors) {
                throw new Error('Failed to exchange token')
            }

            const { athlete } = tokenData
            if (!athlete?.id) {
                throw new Error('Strava athlete missing from token response')
            }

            const expiresAt = Number(tokenData.expires_at)
            if (!tokenData.access_token || !tokenData.refresh_token || !Number.isFinite(expiresAt)) {
                throw new Error('Strava token response missing activity access')
            }

            if (oauthState.mode === 'connect') {
                const user = await requestUser(supabaseAdmin, req)
                if (!user) throw new Error('Sign in to DFIU before connecting Strava.')
                await saveStravaConnection(supabaseAdmin, user.id, athlete.id, tokenData, expiresAt)
                return json({ connected: true })
            }

            const email = `${athlete.id}@strava.dfiu.app`
            const displayName = `${athlete.firstname ?? ''} ${athlete.lastname ?? ''}`.trim() || `Strava ${athlete.id}`
            const metadata = {
                name: displayName,
                avatar_url: athlete.profile ?? null,
                strava_id: athlete.id,
            }

            let user = await findAuthUserByEmail(supabaseUrl, serviceKey, email)

            if (!user) {
                const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    password: crypto.randomUUID(),
                    email_confirm: true,
                    user_metadata: metadata,
                })
                if (createError) {
                    // Race: another callback created the user — look up again.
                    user = await findAuthUserByEmail(supabaseUrl, serviceKey, email)
                    if (!user) throw createError
                } else {
                    user = newUser.user
                }
            } else {
                const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
                    user_metadata: metadata,
                })
                if (updateError) throw updateError
            }

            if (!user) throw new Error('Unable to resolve Strava user')

            await saveStravaConnection(supabaseAdmin, user.id, athlete.id, tokenData, expiresAt)

            const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email,
            })
            if (linkError) throw linkError
            const tokenHash = linkData.properties.hashed_token
            if (!tokenHash) throw new Error('Unable to create Strava login session')

            const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
                token_hash: tokenHash,
                type: 'email',
            })
            if (sessionError) throw sessionError

            return json({ session: sessionData.session })
        }

        throw new Error('Invalid action')
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Strava authentication error'
        return json({ error: message }, 400)
    }
})

async function requestUser(supabaseAdmin: SupabaseAdmin, req: Request): Promise<{ id: string } | null> {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return null
    const { data, error } = await supabaseAdmin.auth.getUser(authorization.slice('Bearer '.length))
    if (error || !data.user) return null
    return { id: data.user.id }
}

async function saveStravaConnection(
    supabaseAdmin: SupabaseAdmin,
    userId: string,
    athleteId: number,
    tokenData: { access_token: string; refresh_token: string; scope?: unknown },
    expiresAt: number,
) {
    const { error } = await supabaseAdmin
        .from('strava_connections')
        .upsert({
            user_id: userId,
            athlete_id: athleteId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: new Date(expiresAt * 1000).toISOString(),
            scope: typeof tokenData.scope === 'string' ? tokenData.scope : null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
    if (error) throw error
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

async function findAuthUserByEmail(
    supabaseUrl: string,
    serviceKey: string,
    email: string,
): Promise<{ id: string } | null> {
    const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
        },
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`Auth admin lookup failed (${res.status}): ${text}`)
    }
    const payload = await res.json()
    const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : []
    return users[0] ?? null
}

async function signState(secret: string, nonce: string, mode: OAuthMode): Promise<string> {
    const payload = btoa(JSON.stringify({ n: nonce, e: Date.now() + STATE_TTL_MS, m: mode }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const sig = await hmacHex(secret, payload)
    return `${payload}.${sig}`
}

async function verifyState(secret: string, state: string): Promise<OAuthState | null> {
    const [payload, sig] = state.split('.')
    if (!payload || !sig) return null
    const expected = await hmacHex(secret, payload)
    if (!timingSafeEqual(sig, expected)) return null
    try {
        const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
        const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
        const parsed = JSON.parse(atob(padded + pad)) as { e?: number; m?: unknown }
        if (typeof parsed.e !== 'number' || parsed.e < Date.now()) return null
        return { mode: parsed.m === 'connect' ? 'connect' : 'login' }
    } catch {
        return null
    }
}

async function hmacHex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
    return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    let out = 0
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return out === 0
}
