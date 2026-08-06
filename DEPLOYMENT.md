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

## Nginx Configuration (Example)

```nginx
# Link-preview bots get event-specific Open Graph HTML from the share-preview
# Edge Function. Humans still receive the SPA. Requires the public anon key in
# proxy headers (same value as VITE_SUPABASE_ANON_KEY — safe to embed server-side).

map $http_user_agent $dfiu_link_bot {
    default 0;
    ~*(?i)(facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|skypeuripreview|applebot|embedly|pinterest|redditbot) 1;
}

map $uri $dfiu_og_path {
    default 1;
    ~*^/(assets|login|signup|dashboard|settings|events|auth|og-image|logo\.png|og-default\.png) 0;
    =/ 0;
}

map "$dfiu_link_bot:$dfiu_og_path" $dfiu_serve_og {
    default 0;
    "1:1" 1;
}

server {
    listen 80;
    server_name your-domain.com;
    root /var/www/dfiu;
    index index.html;

    location = /og-image {
        proxy_pass https://YOUR_PROJECT.supabase.co/functions/v1/share-preview$is_args$args;
        proxy_ssl_server_name on;
        proxy_set_header Host YOUR_PROJECT.supabase.co;
        proxy_set_header apikey YOUR_ANON_KEY;
        proxy_set_header Authorization "Bearer YOUR_ANON_KEY";
    }

    location / {
        error_page 418 = @og_preview;
        if ($dfiu_serve_og = 1) { return 418; }
        try_files $uri $uri/ /index.html;
    }

    location @og_preview {
        set $og_args "path=$uri&format=html";
        if ($args) { set $og_args "path=$uri&format=html&$args"; }
        proxy_pass https://YOUR_PROJECT.supabase.co/functions/v1/share-preview?$og_args;
        proxy_ssl_server_name on;
        proxy_set_header Host YOUR_PROJECT.supabase.co;
        proxy_set_header apikey YOUR_ANON_KEY;
        proxy_set_header Authorization "Bearer YOUR_ANON_KEY";
    }
}
```

Deploy the `share-preview` Edge Function with JWT verification off:

```bash
supabase functions deploy share-preview --no-verify-jwt
supabase secrets set SITE_URL=https://dfiu.app
```
