#!/usr/bin/env node
/**
 * Injects race-specific Open Graph / Twitter meta into index.html for
 * vanity / UUID / /race/:id URLs so iMessage, Slack, etc. show the event
 * name (same approach as RouteSmith).
 *
 * Env (see server/.env.example):
 *   PORT, DIST_DIR, SUPABASE_URL, SUPABASE_ANON_KEY, SITE_ORIGIN
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile(path.join(__dirname, '.env'))

const PORT = Number(process.env.PORT || 3457)
const DIST_DIR = process.env.DIST_DIR || '/var/www/dfiu'
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://dfiu.app').replace(/\/$/, '')
const DEFAULT_IMAGE = `${SITE_ORIGIN}/og-default.png?v=260`

const RESERVED = new Set([
  'login', 'signup', 'dashboard', 'settings', 'events', 'race', 'auth', 'new',
  'assets', 'api', 'og-image', 'healthz',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RACE_PATH_RE =
  /^\/(?:race\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
const ALIAS_RE = /^\/([a-z0-9][a-z0-9-]{1,46}[a-z0-9])\/?$/i

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * iMessage truncates og:title around ~44 chars.
 * Keep name + short stats in that budget.
 */
function buildTitle(race) {
  const dist =
    race.distance_miles != null && Number.isFinite(Number(race.distance_miles))
      ? `${Number(race.distance_miles).toFixed(1)} mi`
      : null
  const name = String(race.name || 'Event').trim()
  if (!dist) return name.slice(0, 44)
  const sep = ' | '
  const max = 44
  if (name.length + sep.length + dist.length <= max) return `${name}${sep}${dist}`
  const nameBudget = max - sep.length - dist.length - 1
  if (nameBudget < 8) return dist.slice(0, max)
  return `${name.slice(0, nameBudget)}…${sep}${dist}`
}

function buildDescription(race) {
  const parts = []
  if (race.distance_miles != null && Number.isFinite(Number(race.distance_miles))) {
    parts.push(`${Number(race.distance_miles).toFixed(1)} mi`)
  }
  if (race.location) parts.push(String(race.location).trim())
  if (parts.length) return parts.join(' · ').slice(0, 200)
  return "Don't F* It Up"
}

function upsertMeta(html, { title, description, url, image }) {
  const safeTitle = escapeAttr(title)
  const safeDesc = escapeAttr(description)
  const safeUrl = escapeAttr(url)
  const safeImage = escapeAttr(image)

  const tags = [
    `<title>${safeTitle}</title>`,
    `<meta name="description" content="${safeDesc}" />`,
    `<meta property="og:site_name" content="Don't F* It Up" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:image" content="${safeImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="260" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    `<meta name="twitter:image" content="${safeImage}" />`,
  ].join('\n  ')

  let out = html
  out = out.replace(/<title>[^<]*<\/title>/i, '')
  out = out.replace(/<meta\s+(?:name|property)=["'](?:description|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
  out = out.replace(/<head([^>]*)>/i, `<head$1>\n  ${tags}`)
  return out
}

function readIndexHtml() {
  return fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8')
}

function parseRaceKey(pathname) {
  const raceMatch = RACE_PATH_RE.exec(pathname)
  if (raceMatch) return { type: 'uuid', key: raceMatch[1] }

  const aliasMatch = ALIAS_RE.exec(pathname)
  if (!aliasMatch) return null
  const key = aliasMatch[1].toLowerCase()
  if (RESERVED.has(key) || key.endsWith('.png') || key.endsWith('.jpg')) return null
  if (UUID_RE.test(key)) return { type: 'uuid', key }
  return { type: 'alias', key }
}

async function fetchRaceMeta(parsed, shareToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const select = 'id,name,location,distance_miles,is_public,public_share_alias,public_share_enabled'
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  }

  let filter
  if (parsed.type === 'uuid') {
    filter = `id=eq.${encodeURIComponent(parsed.key)}`
  } else {
    filter = `public_share_alias=eq.${encodeURIComponent(parsed.key)}`
  }

  const url = `${SUPABASE_URL}/rest/v1/races?${filter}&select=${select}&limit=1`
  const res = await fetch(url, { headers })
  if (!res.ok) {
    console.error('[og] races HTTP', res.status, await res.text())
    return null
  }
  const rows = await res.json()
  const race = Array.isArray(rows) ? rows[0] : null
  if (!race?.name) return null

  if (race.is_public) return race
  // Private share links: anon select may still return the row only when public;
  // if we got a row that isn't public, require a share query (RLS usually hides it).
  if (shareToken && race.public_share_enabled) return race
  return null
}

function pageUrlFor(race, reqUrl) {
  const key = race.public_share_alias || race.id
  const u = new URL(`${SITE_ORIGIN}/${encodeURIComponent(key)}`)
  const share = reqUrl.searchParams.get('share')
  if (share) u.searchParams.set('share', share)
  const demo = reqUrl.searchParams.get('demo')
  if (demo) u.searchParams.set('demo', demo)
  return u.toString()
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }

    const parsed = parseRaceKey(url.pathname)
    let html = readIndexHtml()

    if (parsed) {
      const race = await fetchRaceMeta(parsed, url.searchParams.get('share'))
      if (race?.name) {
        html = upsertMeta(html, {
          title: buildTitle(race),
          description: buildDescription(race),
          url: pageUrlFor(race, url),
          image: DEFAULT_IMAGE,
        })
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    })
    res.end(html)
  } catch (err) {
    console.error('[og] error', err)
    try {
      const html = readIndexHtml()
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Error')
    }
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[og] listening on 127.0.0.1:${PORT} dist=${DIST_DIR}`)
})
