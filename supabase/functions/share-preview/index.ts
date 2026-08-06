// Edge function: share-preview
//
// Serves Open Graph HTML + PNG cards for link previews (iMessage, Slack, etc.).
// Public — crawlers have no JWT. verify_jwt must stay off.
//
// Query:
//   path=/ac100 | /race/{uuid} | /{uuid}
//   share=token
//   format=html | image

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { zlibSync } from 'https://esm.sh/fflate@0.8.2'

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://dfiu.app'
const WIDTH = 1200
const HEIGHT = 630
const ORANGE = { r: 234, g: 88, b: 12 } // #ea580c
const ORANGE_DARK = { r: 194, g: 65, b: 12 } // #c2410c
const CREAM = { r: 255, g: 237, b: 213 } // #ffedd5
const WHITE = { r: 255, g: 255, b: 255 }

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
      const png = await renderOgPng(
        title,
        allowed && race ? 'Event plan on DFIU' : 'Plan the race. Respect the trail.',
      )
      return new Response(png, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const imageUrl = allowed && race
      ? `${SITE_URL}/og-image?path=${encodeURIComponent(`/${race.public_share_alias || race.id}`)}&format=image&v=3` +
        (share ? `&share=${encodeURIComponent(share)}` : '')
      : `${SITE_URL}/og-default.png?v=3`

    // Humans land on vanity URLs too (iMessage uses Safari-like UAs). Send them
    // to the SPA at /race/:id while crawlers keep this document's OG tags.
    const appUrl = allowed && race
      ? buildAppUrl(race.id, url.searchParams)
      : null

    const html = buildOgHtml({ title, description, pageUrl, imageUrl, appUrl })
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        ...(allowed && race ? { 'X-DFIU-Race': race.id } : {}),
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
  const keyToUse = serviceKey || anonKey
  if (!supabaseUrl || !keyToUse) {
    console.error('share-preview: missing supabase env')
    return null
  }

  const admin = createClient(supabaseUrl, keyToUse)
  const select = serviceKey
    ? 'id, name, location, distance_miles, is_public, public_share_enabled, public_share_token, public_share_alias'
    : 'id, name, location, distance_miles, is_public, public_share_enabled, public_share_alias'

  if (UUID_RE.test(key)) {
    const { data, error } = await admin.from('races').select(select).eq('id', key).maybeSingle()
    if (error) {
      console.error('share-preview uuid lookup', error.message)
      return null
    }
    return data ? normalizeRace(data as Record<string, unknown>) : null
  }

  const alias = key.trim().toLowerCase()
  const { data, error } = await admin.from('races').select(select).eq('public_share_alias', alias).maybeSingle()
  if (error) {
    console.error('share-preview alias lookup', error.message)
    return null
  }
  return data ? normalizeRace(data as Record<string, unknown>) : null
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

function buildAppUrl(raceId: string, params: URLSearchParams): string {
  const next = new URLSearchParams()
  for (const [k, v] of params.entries()) {
    if (k === 'path' || k === 'format') continue
    next.set(k, v)
  }
  const qs = next.toString()
  return `${SITE_URL}/race/${encodeURIComponent(raceId)}${qs ? `?${qs}` : ''}`
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
  appUrl: string | null
}): string {
  const t = escapeHtml(opts.title)
  const d = escapeHtml(opts.description)
  const u = escapeHtml(opts.pageUrl)
  const img = escapeHtml(opts.imageUrl)
  const app = opts.appUrl
  const redirectScript = app
    ? `<script>location.replace(${JSON.stringify(app)}+location.hash)</script>`
    : ''
  const fallbackHref = escapeHtml(app ?? opts.pageUrl)
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
  <meta property="og:image:secure_url" content="${img}" />
  <meta property="og:image:width" content="${WIDTH}" />
  <meta property="og:image:height" content="${HEIGHT}" />
  <meta property="og:image:type" content="image/png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${img}" />
</head>
<body>
  <p><a href="${fallbackHref}">${t}</a></p>
  ${redirectScript}
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

// --- PNG card (iMessage requires raster images; SVG is ignored) -------------

/** 5×7 glyphs for A–Z, 0–9, and common punctuation. */
const GLYPHS: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  '*': [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0b00100],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
}

async function renderOgPng(headline: string, subtitle: string): Promise<Uint8Array> {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3)
  fillRect(pixels, 0, 0, WIDTH, HEIGHT, ORANGE)
  fillRect(pixels, 0, HEIGHT - 90, WIDTH, 90, ORANGE_DARK)

  drawText(pixels, "DON'T F* IT UP", 64, 64, 4, CREAM)
  const lines = wrapLines(normalizeForGlyphs(headline), 20)
  const scale = lines.length > 2 ? 5 : 6
  let y = 210
  for (const line of lines.slice(0, 3)) {
    drawText(pixels, line, 64, y, scale, WHITE)
    y += 7 * scale + 20
  }
  drawText(pixels, normalizeForGlyphs(subtitle).slice(0, 42), 64, HEIGHT - 42, 3, CREAM)

  return await encodePngRgb(pixels, WIDTH, HEIGHT)
}

function normalizeForGlyphs(s: string): string {
  return s
    .toUpperCase()
    .replace(/[""]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9 *\-'.,!?&/:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['DFIU']
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) cur = next
    else {
      if (cur) lines.push(cur)
      cur = w.length > maxChars ? w.slice(0, maxChars) : w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function drawText(
  pixels: Uint8Array,
  text: string,
  startX: number,
  startY: number,
  scale: number,
  color: { r: number; g: number; b: number },
) {
  let x = startX
  for (const ch of text) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' ']
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row]
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          fillRect(pixels, x + col * scale, startY + row * scale, scale, scale, color)
        }
      }
    }
    x += 6 * scale
    if (x > WIDTH - 48) break
  }
}

function fillRect(
  pixels: Uint8Array,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: { r: number; g: number; b: number },
) {
  const x1 = Math.min(WIDTH, Math.max(0, x0))
  const y1 = Math.min(HEIGHT, Math.max(0, y0))
  const x2 = Math.min(WIDTH, Math.max(0, x0 + w))
  const y2 = Math.min(HEIGHT, Math.max(0, y0 + h))
  for (let y = y1; y < y2; y++) {
    let i = (y * WIDTH + x1) * 3
    for (let x = x1; x < x2; x++) {
      pixels[i] = color.r
      pixels[i + 1] = color.g
      pixels[i + 2] = color.b
      i += 3
    }
  }
}

async function encodePngRgb(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const dest = y * (width * 3 + 1)
    raw[dest] = 0
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), dest + 1)
  }
  const compressed = await zlibDeflate(raw)

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0))]
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(concat(typeBytes, data)) >>> 0)
  return out
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  // fflate produces real zlib; solid-color cards compress to a few KB.
  return zlibSync(data, { level: 6 })
}
