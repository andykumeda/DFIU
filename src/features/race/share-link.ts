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

export function buildShareLink(raceId: string, token: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dfiu.app'
    return `${origin}/race/${raceId}?share=${encodeURIComponent(token)}`
}
