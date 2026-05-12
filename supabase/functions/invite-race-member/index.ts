// Edge function: invite-race-member
//
// Auth: caller must send Authorization: Bearer <user-JWT>.
// Body: { race_id, email, role, permission }
//
// Behavior:
//   1. Validates caller membership (any member) and permission rules
//      (only owners may grant permission='edit').
//   2. If email already belongs to an auth.users row → insert
//      race_memberships directly (no invite email).
//   3. Otherwise → insert pending_race_memberships and call
//      auth.admin.inviteUserByEmail with redirect to /auth/set-password.
//      handle_new_user trigger claims pending row on signup.

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
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const siteUrl = Deno.env.get('SITE_URL') ?? 'https://dfiu.app'

        const authHeader = req.headers.get('Authorization') ?? ''
        if (!authHeader.startsWith('Bearer ')) {
            return json({ error: 'Missing Authorization' }, 401)
        }

        const { race_id, email, role, permission } = await req.json()
        if (!race_id || !email || !role || !permission) {
            return json({ error: 'race_id, email, role, permission required' }, 400)
        }
        if (!['crew', 'pacer'].includes(role)) {
            return json({ error: 'role must be crew or pacer' }, 400)
        }
        if (!['view', 'edit'].includes(permission)) {
            return json({ error: 'permission must be view or edit' }, 400)
        }

        const normalizedEmail = String(email).trim().toLowerCase()

        // Caller-bound client — enforces RLS as the inviting user.
        const callerClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: userData, error: userErr } = await callerClient.auth.getUser()
        if (userErr || !userData?.user) {
            return json({ error: 'Invalid session' }, 401)
        }
        const caller = userData.user

        // Permission check via RPC (SECURITY DEFINER, reads memberships).
        const { data: isMember, error: memberErr } = await callerClient
            .rpc('user_is_race_member', { rid: race_id })
        if (memberErr) return json({ error: memberErr.message }, 500)
        if (!isMember) return json({ error: 'Not a member of this race' }, 403)

        if (permission === 'edit') {
            const { data: isOwner, error: ownerErr } = await callerClient
                .rpc('user_owns_race', { rid: race_id })
            if (ownerErr) return json({ error: ownerErr.message }, 500)
            if (!isOwner) {
                return json({ error: 'Only owners can grant edit permission' }, 403)
            }
        }

        // Service-role client for admin operations.
        const admin = createClient(supabaseUrl, serviceKey)

        // Check if email already maps to an auth user.
        const { data: existingProfile } = await admin
            .from('profiles')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle()

        if (existingProfile) {
            // User exists — insert race_memberships directly. Self-invite is a no-op.
            if (existingProfile.id === caller.id) {
                return json({ error: 'You are already a member' }, 400)
            }
            const { error: insertErr } = await admin
                .from('race_memberships')
                .insert({
                    race_id,
                    user_id: existingProfile.id,
                    role,
                    permission,
                    granted_by: caller.id,
                })
            if (insertErr) {
                if (insertErr.code === '23505') {
                    return json({ status: 'already_member' })
                }
                return json({ error: insertErr.message }, 500)
            }
            return json({ status: 'added_existing_user' })
        }

        // No existing user — insert pending row + send invite email.
        const { error: pendingErr } = await admin
            .from('pending_race_memberships')
            .upsert(
                {
                    race_id,
                    email: normalizedEmail,
                    role,
                    permission,
                    invited_by: caller.id,
                },
                { onConflict: 'race_id,email' }
            )
        if (pendingErr) return json({ error: pendingErr.message }, 500)

        const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
            normalizedEmail,
            { redirectTo: `${siteUrl}/auth/set-password` }
        )
        if (inviteErr) {
            // "Email rate limit exceeded" or similar — keep pending row so
            // signup via other means still claims membership.
            return json({ status: 'invite_email_failed', message: inviteErr.message }, 502)
        }

        return json({ status: 'invited' })
    } catch (err) {
        return json({ error: (err as Error).message }, 500)
    }
})

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
