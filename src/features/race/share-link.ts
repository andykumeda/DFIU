export function createShareToken(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16)
        crypto.getRandomValues(bytes)
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Top-level path segments owned by the app — cannot be vanity aliases. */
export const RESERVED_SHARE_ALIASES = new Set([
    'login',
    'signup',
    'dashboard',
    'settings',
    'events',
    'race',
    'auth',
    'new',
    'assets',
    'api',
    'logo.png',
])

const SHARE_ALIAS_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRaceUuid(value: string): boolean {
    return UUID_RE.test(value)
}

/** Lowercase trim; empty string means “clear alias”. */
export function normalizeShareAlias(raw: string): string {
    return raw.trim().toLowerCase()
}

export type ShareAliasValidation =
    | { ok: true; alias: string | null }
    | { ok: false; error: string }

export function validateShareAlias(raw: string): ShareAliasValidation {
    const alias = normalizeShareAlias(raw)
    if (!alias) return { ok: true, alias: null }
    if (RESERVED_SHARE_ALIASES.has(alias)) {
        return { ok: false, error: `"${alias}" is reserved and cannot be used as an alias.` }
    }
    if (isRaceUuid(alias)) {
        return { ok: false, error: 'Alias cannot look like an event ID.' }
    }
    if (!SHARE_ALIAS_RE.test(alias)) {
        return {
            ok: false,
            error: 'Use 3–48 lowercase letters, numbers, or hyphens (start and end with a letter or number).',
        }
    }
    return { ok: true, alias }
}

export function buildShareLink(raceId: string, token: string, alias?: string | null): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dfiu.app'
    const key = (alias && alias.trim()) || raceId
    return `${origin}/${encodeURIComponent(key)}?share=${encodeURIComponent(token)}`
}

/**
 * Capability token from `/{idOrAlias}?share=…` or legacy `/race/:id?share=…`.
 * Sent as `x-dfiu-share-token` on Supabase requests.
 */
export function getShareTokenFromUrl(href = typeof window !== 'undefined' ? window.location.href : ''): string | null {
    if (!href) return null
    try {
        const url = new URL(href)
        const token = url.searchParams.get('share')?.trim()
        if (!token) return null

        const path = url.pathname.replace(/\/+$/, '') || '/'
        if (/^\/race\/[^/]+$/i.test(path)) return token
        const single = path.match(/^\/([^/]+)$/)
        if (!single) return null
        const key = decodeURIComponent(single[1]).toLowerCase()
        if (RESERVED_SHARE_ALIASES.has(key)) return null
        return token
    } catch {
        return null
    }
}

export function isShareLinkView(href?: string): boolean {
    return !!getShareTokenFromUrl(href)
}
