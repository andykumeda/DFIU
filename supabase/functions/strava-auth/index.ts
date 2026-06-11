
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { action, redirectUrl, code } = await req.json()
        const clientId = Deno.env.get('STRAVA_CLIENT_ID')
        const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')

        if (!clientId || !clientSecret) {
            throw new Error('Missing Strava configuration')
        }

        if (action === 'start') {
            const scope = 'activity:read_all,profile:read_all'
            const params = new URLSearchParams({
                client_id: clientId,
                response_type: 'code',
                redirect_uri: redirectUrl,
                approval_prompt: 'auto',
                scope,
            })
            const url = `https://www.strava.com/oauth/authorize?${params.toString()}`
            return new Response(JSON.stringify({ url }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (action === 'callback') {
            // Exchange code for token
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
            if (tokenData.errors) {
                throw new Error('Failed to exchange token')
            }

            const { athlete, access_token, refresh_token, expires_at } = tokenData

            // Create or Update User
            // Note: In a real app we might want to link this to an existing auth user if logged in
            // For now, we'll try to find a user by strava_id metadata or create a new one via Admin API?
            // Actually, Supabase Auth doesn't let us easily create a user with custom ID.
            // Strategy: We will create a "dummy" email for the Strava user if they don't exist: [strava_id]@strava.dfiu.app

            const email = `${athlete.id}@strava.dfiu.app`
            const password = crypto.randomUUID() // Random password, they won't use it

            // Check if user exists by strava_id first
            const { data: { users } } = await supabaseClient.auth.admin.listUsers()
            let user = users.find(u => u.user_metadata?.strava_id === athlete.id) || users.find(u => u.email === email)

            if (!user) {
                const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        name: `${athlete.firstname} ${athlete.lastname}`,
                        avatar_url: athlete.profile,
                        strava_id: athlete.id
                    }
                })
                if (createError) throw createError
                user = newUser.user
            } else {
                // Update metadata
                await supabaseClient.auth.admin.updateUserById(user.id, {
                    user_metadata: {
                        name: `${athlete.firstname} ${athlete.lastname}`,
                        avatar_url: athlete.profile,
                        strava_id: athlete.id,
                        strava_access_token: access_token,
                        strava_refresh_token: refresh_token,
                        strava_expires_at: expires_at
                    }
                })
            }

            // Create Session
            // We can't easily "create a session" object to return to client without signing them in.
            // But verifyOtp or signInWithPassword works.
            // Easier: Admin create session? No 'createSession' in admin.
            // Workaround: We return the credentials or custom token?
            // Better: We rely on the client to sign in? No, we want to sign them in.

            // Let's generate a Magic Link or just sign them in?
            // Actually, since we know the email, we can generate a session using `signInWithPassword` if we updated the password?
            // Or `generateLink`.

            // Alternative: We manually issue a JWT? Hard with Supabase.

            // Let's use `signInWithIdToken` if we were an OIDC provider... we aren't.

            // BEST APPROACH for "Custom Auth":
            // We return a custom access token? No, we want Supabase Auth efficiency.

            // Let's just return the email/password (bad practice?) or specific token.
            // Wait, we can use `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })`
            // and return the `action_link`? Then frontend redirects to it?

            // Let's try to just update the user with the tokens in metadata, and then
            // we need to log them in.

            // Let's return the tokens and let the client save them? No, we want `supabase.auth.user` to be populated.

            // Looked at another way: The reference app uses its OWN session management (FastAPI).
            // Here we want to use Supabase Auth.

            // Solution: We will use the "Dummy Email" strategy.
            // We will reset the user's password to a known temporary random string, sign them in on server side, get session, return session.

            const tempPassword = crypto.randomUUID()
            await supabaseClient.auth.admin.updateUserById(user!.id, { password: tempPassword })

            const { data: sessionData, error: sessionError } = await supabaseClient.auth.signInWithPassword({
                email,
                password: tempPassword
            })

            if (sessionError) throw sessionError

            return new Response(JSON.stringify({ session: sessionData.session }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        throw new Error('Invalid action')

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Strava authentication error'
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
