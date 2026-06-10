// Edge function: invite-race-member
//
// Auth: caller must send Authorization: Bearer <user-JWT>.
// Body: { race_id, email, role, roles, is_crew, is_pacer, permission, resend, send_email }
//
// Behavior:
//   1. Validates caller membership (any member) and permission rules
//      (runner/team managers may add crew/pacer view-log members).
//   2. If email already belongs to an auth.users row → insert/update
//      race_memberships directly; optionally send a magic link to the event.
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

        const body = await req.json()
        const { race_id, email, permission } = body
        if (!race_id || !email || !permission) {
            return json({ error: 'race_id, email, permission required' }, 400)
        }
        if (!['view', 'edit'].includes(permission)) {
            return json({ error: 'permission must be view or edit' }, 400)
        }
        const roleFlags = resolveRoleFlags(body)
        if (!roleFlags.is_crew && !roleFlags.is_pacer) {
            return json({ error: 'Select at least one role: crew or pacer' }, 400)
        }
        const role = roleFlags.is_crew ? 'crew' : 'pacer'
        const normalizedPermission = permission
        const shouldSendExistingUserEmail = body.send_email === true || body.resend === true
        const isResend = body.resend === true

        const normalizedEmail = String(email).trim().toLowerCase()
        const setPasswordRedirectTo = buildUrl(siteUrl, '/auth/set-password', { race_id: String(race_id) })
        const eventRedirectTo = buildUrl(siteUrl, `/race/${encodeURIComponent(String(race_id))}`)

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
        const { data: canManageTeam, error: memberErr } = await callerClient
            .rpc('user_can_manage_team', { rid: race_id })
        if (memberErr) return json({ error: memberErr.message }, 500)
        if (!canManageTeam) return json({ error: 'No permission to manage this race team' }, 403)

        // Service-role client for admin operations.
        const admin = createClient(supabaseUrl, serviceKey)

        // Check if email already maps to an auth user.
        const { data: existingProfile } = await admin
            .from('profiles')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle()

        if (existingProfile) {
            // User exists — insert or update race_memberships directly. Self-invite is a no-op.
            if (existingProfile.id === caller.id) {
                return json({ error: 'You are already a member' }, 400)
            }
            const { data: existingMembership, error: existingMembershipErr } = await admin
                .from('race_memberships')
                .select('role, is_runner')
                .eq('race_id', race_id)
                .eq('user_id', existingProfile.id)
                .maybeSingle()

            if (existingMembershipErr) return json({ error: existingMembershipErr.message }, 500)
            if (existingMembership?.role === 'owner') return json({ status: 'already_member' })

            const membershipPayload = {
                race_id,
                user_id: existingProfile.id,
                role,
                permission: normalizedPermission,
                is_crew: roleFlags.is_crew,
                is_pacer: roleFlags.is_pacer,
                is_runner: existingMembership?.is_runner ?? false,
                granted_by: caller.id,
            }

            const { error: writeErr } = existingMembership
                ? await admin
                    .from('race_memberships')
                    .update(membershipPayload)
                    .eq('race_id', race_id)
                    .eq('user_id', existingProfile.id)
                : await admin
                    .from('race_memberships')
                    .insert(membershipPayload)
            if (writeErr) {
                return json({ error: writeErr.message }, 500)
            }

            const baseStatus = existingMembership ? 'updated_existing_user' : 'added_existing_user'
            if (shouldSendExistingUserEmail) {
                const { error: linkErr } = await admin.auth.signInWithOtp({
                    email: normalizedEmail,
                    options: {
                        emailRedirectTo: eventRedirectTo,
                        shouldCreateUser: false,
                    },
                })
                if (linkErr) {
                    return json({
                        status: 'existing_user_email_failed',
                        membership_status: baseStatus,
                        message: linkErr.message,
                    })
                }
                return json({ status: `${baseStatus}_email_sent` })
            }

            return json({ status: baseStatus })
        }

        // No existing user — insert pending row + send invite email.
        const { error: pendingErr } = await admin
            .from('pending_race_memberships')
            .upsert(
                {
                    race_id,
                    email: normalizedEmail,
                    role,
                    permission: normalizedPermission,
                    is_crew: roleFlags.is_crew,
                    is_pacer: roleFlags.is_pacer,
                    invited_by: caller.id,
                },
                { onConflict: 'race_id,email' }
            )
        if (pendingErr) return json({ error: pendingErr.message }, 500)

        const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
            normalizedEmail,
            { redirectTo: setPasswordRedirectTo }
        )
        if (inviteErr) {
            // "Email rate limit exceeded" or similar — keep pending row so
            // signup via other means still claims membership.
            return json({ status: isResend ? 'resend_email_failed' : 'invite_email_failed', message: inviteErr.message })
        }

        return json({ status: isResend ? 'resent' : 'invited' })
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

function resolveRoleFlags(body: Record<string, unknown>): { is_crew: boolean; is_pacer: boolean } {
    let isCrew = body.is_crew === true
    let isPacer = body.is_pacer === true

    if (typeof body.role === 'string') {
        isCrew ||= body.role === 'crew'
        isPacer ||= body.role === 'pacer'
    }

    if (Array.isArray(body.roles)) {
        isCrew ||= body.roles.includes('crew')
        isPacer ||= body.roles.includes('pacer')
    }

    return { is_crew: isCrew, is_pacer: isPacer }
}

function buildUrl(siteUrl: string, path: string, params?: Record<string, string>): string {
    const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`
    const url = new URL(path.replace(/^\//, ''), base)
    for (const [key, value] of Object.entries(params ?? {})) {
        url.searchParams.set(key, value)
    }
    return url.toString()
}
