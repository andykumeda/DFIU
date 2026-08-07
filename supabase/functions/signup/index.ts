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
        const { email, password, accessCode } = await req.json()
        if (typeof accessCode !== 'string' || accessCode.trim() !== '67') {
            return json({ error: 'A valid access code is required to create an account.' }, 400)
        }
        if (typeof email !== 'string' || !email.trim() || typeof password !== 'string') {
            return json({ error: 'Email and password are required.' }, 400)
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        )
        const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
        })

        if (error) return json({ error: error.message }, 400)
        return json({ session: data.session })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to create account'
        return json({ error: message }, 400)
    }
})

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}
