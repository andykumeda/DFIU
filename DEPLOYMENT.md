# Deployment Guide

This guide explains how to deploy the "Don't F* It Up" (DFIU) application from your local development machine (Mac) to a remote Linux production server.

## Prerequisites

1.  **Remote Server**: A Linux server (e.g., Ubuntu/Debian) with SSH access.
2.  **Web Server**: Nginx (or Apache) installed and configured to serve static files from the target directory (default: `/var/www/dfiu`).
3.  **Permissions**: The SSH user must have write permissions to the target directory.
    *   *Recommended*: Change ownership of the folder to your user: `sudo chown -R $USER:$USER /var/www/dfiu`

## Configuration

Add the following variables to your local `.env` file (never commit this file):

```bash
# Deployment Configuration
DEPLOY_USER=your_ssh_username
DEPLOY_HOST=your_server_ip_or_domain
DEPLOY_DIR=/var/www/dfiu
```

If `DEPLOY_USER` is omitted, the deploy script uses the current local username. The current production directory is writable by the `andy` SSH user, not `root`.

Client env vars (also local-only; see `.env.example`):

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_MAPBOX_TOKEN=...
```

Do **not** put Strava or Visual Crossing secrets in `VITE_*` vars. Set them as Supabase Edge Function secrets.

## Deployment Steps

### 1. Frontend Deployment (Static Files)

```bash
npm run deploy
```

**What this does:**
1.  Validates the required Supabase and Mapbox client build values.
2.  Installs exact dependencies with `npm ci`.
3.  Builds the project locally (`npm run build`).
4.  Connects to `DEPLOY_HOST` via SSH.
5.  Uploads new hashed Vite assets to `DEPLOY_DIR/assets` **without deleting older assets**, so already-open tabs can still lazy-load chunks from their current app version.
6.  Syncs non-asset app-shell files from `dist/` to `DEPLOY_DIR` (with deletion for stale shell files).
7.  Normalizes remote permissions (755 dirs / 644 files).

If a user still hits `Failed to fetch dynamically imported module`, the app ErrorBoundary auto-reloads once (hard refresh also fixes it).

After deploy, compare the app footer/build label with:

```bash
git describe --always --dirty --abbrev=7
```

### 2. Backend Deployment (Supabase)

Apply new SQL migrations in `supabase/migrations/` to the linked project, then deploy the Edge Functions that changed:

```bash
# Secrets (once / when rotating)
supabase secrets set VISUAL_CROSSING_KEY=...
supabase secrets set STRAVA_CLIENT_ID=...
supabase secrets set STRAVA_CLIENT_SECRET=...

# Functions
supabase functions deploy strava-auth --no-verify-jwt   # OAuth start/callback are pre-session
supabase functions deploy strava-activity                # JWT required
supabase functions deploy weather                        # JWT required
supabase functions deploy invite-race-member             # JWT required
supabase functions deploy share-preview --no-verify-jwt  # Link-preview OG HTML/images (no JWT)
```

`strava-auth` keeps gateway JWT verification off because login/signup run before a Supabase session exists. CSRF is handled with HMAC-signed OAuth `state`.

### Database-change safeguard

The hosted migration history has diverged from this checkout. Do **not** run a blind
`supabase db push`. Apply a reviewed, scoped migration directly to the linked production
project, verify the affected schema/query, and record the action in `HANDOFF.md`.

### 3. CI

GitHub Actions workflow `.github/workflows/ci.yml` runs `npm ci`, lint, vitest, and build on pushes/PRs to `main`.

## Nginx + Open Graph (RouteSmith pattern)

Share / vanity event URLs are proxied to a local Node injector that rewrites
`og:title` / `og:description` into the built SPA `index.html`. Crawlers and
browsers get the same document (no User-Agent sniffing, no JS redirect).

- Server: [`server/og-server.mjs`](server/og-server.mjs) (systemd: `dfiu-og`, port `3457`)
- Nginx template: [`scripts/nginx-dfiu.app.conf`](scripts/nginx-dfiu.app.conf)
- Env: copy [`server/.env.example`](server/.env.example) → `/var/www/dfiu-og/.env` on the host
- Static preview image: `/og-default.png`

`npm run deploy` syncs `server/` and restarts `dfiu-og`.

After changing nginx:

```bash
scp scripts/nginx-dfiu.app.conf web:/etc/nginx/sites-available/dfiu.app
ssh web 'sudo nginx -t && sudo systemctl reload nginx'
```
