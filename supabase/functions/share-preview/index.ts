// Edge function: share-preview
//
// Serves Open Graph HTML and SVG card images for link previews (iMessage, Slack, etc.).
// Public — crawlers have no JWT. verify_jwt must stay off.
//
// Query:
//   path=/ac100 | /race/{uuid} | /{uuid}
//   share=token
//   format=html | image

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://dfiu.app'
const ORANGE = '#ea580c'
const ORANGE_DARK = '#c2410c'
const WIDTH = 1200
const HEIGHT = 630

const RESERVED = new Set([
  'login', 'signup', 'dashboard', 'settings', 'events', 'race', 'auth', 'new',
  'assets', 'api', 'og-image', 'logo.png', 'og-default.png',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RaceRow = {
  id: string
  name: string
  location: string | null
  distance_miles: number | null
  is_public: boolean
  public_share_enabled: boolean | null
  public_share_token: string | null
  public_share_alias: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const url = new URL(req.url)
    const format = (url.searchParams.get('format') ?? 'html').toLowerCase()
    const share = url.searchParams.get('share')?.trim() || null
    const pathParam = url.searchParams.get('path') ?? '/'
    const key = extractRaceKey(pathParam)

    const race = key ? await lookupRace(key) : null
    const allowed = race ? canPreview(race, share) : false
    const title = allowed && race ? race.name : "Don't F* It Up"
    const description = allowed && race
      ? buildDescription(race)
      : 'Plan the race. Respect the trail. Don\'t F* It Up.'
    const pageUrl = allowed && race
      ? buildPageUrl(race, share)
      : `${SITE_URL}/`

    if (format === 'image' || format === 'png' || format === 'svg') {
      const svg = renderOgSvg(
        title,
        allowed && race ? 'Event plan on DFIU' : 'Plan the race. Respect the trail.',
      )
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const imageUrl = allowed && race
      ? `${SITE_URL}/og-image?path=${encodeURIComponent(`/${race.public_share_alias || race.id}`)}&format=image` +
        (share ? `&share=${encodeURIComponent(share)}` : '')
      : `${SITE_URL}/og-default.png`
    const html = buildOgHtml({ title, description, pageUrl, imageUrl })
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=120',
        ...(race ? { 'X-DFIU-Race': race.id } : {}),
        ...(key ? { 'X-DFIU-Key': key } : {}),
      },
    })
  } catch (e) {
    console.error('share-preview error', e)
    return new Response('Preview unavailable', { status: 500 })
  }
})

function extractRaceKey(rawPath: string): string | null {
  let path = rawPath.trim()
  try {
    if (path.startsWith('http')) path = new URL(path).pathname
  } catch { /* keep */ }
  path = path.split('?')[0].replace(/\/+$/, '') || '/'
  if (path === '/' || path === '') return null

  const raceMatch = path.match(/^\/race\/([^/]+)/i)
  if (raceMatch) {
    const id = decodeURIComponent(raceMatch[1])
    return id || null
  }

  const single = path.match(/^\/([^/]+)$/)
  if (!single) return null
  const key = decodeURIComponent(single[1]).toLowerCase()
  if (RESERVED.has(key)) return null
  return key
}

async function lookupRace(key: string): Promise<RaceRow | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  // Prefer service role; anon cannot SELECT public_share_token (column grant lockdown).
  const keyToUse = serviceKey || anonKey
  if (!supabaseUrl || !keyToUse) {
    console.error('share-preview: missing supabase env')
    return null
  }

  const admin = createClient(supabaseUrl, keyToUse)
  // Omit public_share_token when using anon — that column is revoked for non-service roles.
  const select = serviceKey
    ? 'id, name, location, distance_miles, is_public, public_share_enabled, public_share_token, public_share_alias'
    : 'id, name, location, distance_miles, is_public, public_share_enabled, public_share_alias'

  if (UUID_RE.test(key)) {
    const { data, error } = await admin.from('races').select(select).eq('id', key).maybeSingle()
    if (error) {
      console.error('share-preview uuid lookup', error.message)
      return null
    }
    return data ? normalizeRace(data) : null
  }

  const alias = key.trim().toLowerCase()
  const { data, error } = await admin.from('races').select(select).eq('public_share_alias', alias).maybeSingle()
  if (error) {
    console.error('share-preview alias lookup', error.message)
    return null
  }
  return data ? normalizeRace(data) : null
}

function normalizeRace(data: Record<string, unknown>): RaceRow {
  return {
    id: String(data.id),
    name: String(data.name ?? ''),
    location: (data.location as string | null) ?? null,
    distance_miles: data.distance_miles == null ? null : Number(data.distance_miles),
    is_public: Boolean(data.is_public),
    public_share_enabled: data.public_share_enabled == null ? null : Boolean(data.public_share_enabled),
    public_share_token: (data.public_share_token as string | null) ?? null,
    public_share_alias: (data.public_share_alias as string | null) ?? null,
  }
}

function canPreview(race: RaceRow, share: string | null): boolean {
  if (race.is_public) return true
  if (
    share &&
    race.public_share_enabled &&
    race.public_share_token &&
    race.public_share_token === share
  ) {
    return true
  }
  return false
}

function buildDescription(race: RaceRow): string {
  const parts: string[] = []
  if (race.distance_miles != null) parts.push(`${Number(race.distance_miles).toFixed(1)} mi`)
  if (race.location) parts.push(race.location)
  if (parts.length) return parts.join(' · ')
  return 'Race plan on Don\'t F* It Up'
}

function buildPageUrl(race: RaceRow, share: string | null): string {
  const key = race.public_share_alias || race.id
  const base = `${SITE_URL}/${encodeURIComponent(key)}`
  return share ? `${base}?share=${encodeURIComponent(share)}` : base
}

function buildOgHtml(opts: {
  title: string
  description: string
  pageUrl: string
  imageUrl: string
}): string {
  const t = escapeHtml(opts.title)
  const d = escapeHtml(opts.description)
  const u = escapeHtml(opts.pageUrl)
  const img = escapeHtml(opts.imageUrl)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${u}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Don't F* It Up" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${u}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="${WIDTH}" />
  <meta property="og:image:height" content="${HEIGHT}" />
  <meta property="og:image:type" content="image/svg+xml" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
  <meta http-equiv="refresh" content="0;url=${u}" />
</head>
<body>
  <p><a href="${u}">${t}</a></p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeXml(s: string): string {
  return escapeHtml(s).replace(/'/g, '&apos;')
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ["Don't F* It Up"]
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) cur = next
    else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

function renderOgSvg(headline: string, subtitle: string): string {
  const lines = wrapLines(headline, 28)
  const fontSize = lines.length > 2 ? 52 : 64
  const startY = 250
  const lineNodes = lines.map((line, i) => {
    const y = startY + i * (fontSize + 14)
    return `<text x="72" y="${y}" fill="#ffffff" font-size="${fontSize}" font-weight="700" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">${escapeXml(line)}</text>`
  }).join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="100%" height="100%" fill="${ORANGE}"/>
  <rect y="${HEIGHT - 96}" width="100%" height="96" fill="${ORANGE_DARK}"/>
  <text x="72" y="96" fill="#ffedd5" font-size="28" font-weight="600" letter-spacing="0.08em" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">DON&apos;T F* IT UP</text>
  ${lineNodes}
  <text x="72" y="${HEIGHT - 40}" fill="#ffedd5" font-size="26" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">${escapeXml(subtitle)}</text>
</svg>`
}
