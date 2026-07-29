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
1.  Installs exact dependencies with `npm ci`.
2.  Builds the project locally (`npm run build`).
3.  Connects to `DEPLOY_HOST` via SSH.
4.  Syncs the contents of `dist/` to `DEPLOY_DIR` on the server using `rsync`.
5.  Normalizes remote permissions (755 dirs / 644 files).

After deploy, compare the app footer/build label with:

```bash
git describe --always --dirty --abbrev=7
```

### 2. Backend Deployment (Supabase)

Apply new SQL migrations in `supabase/migrations/` to the linked project, then deploy Edge Functions:

```bash
# Secrets (once / when rotating)
supabase secrets set VISUAL_CROSSING_KEY=...
supabase secrets set STRAVA_CLIENT_ID=...
supabase secrets set STRAVA_CLIENT_SECRET=...

# Functions
supabase functions deploy strava-auth --no-verify-jwt   # OAuth start/callback are pre-session
supabase functions deploy weather                        # JWT required
supabase functions deploy invite-race-member             # JWT required
```

`strava-auth` keeps gateway JWT verification off because login/signup run before a Supabase session exists. CSRF is handled with HMAC-signed OAuth `state`.

### 3. CI

GitHub Actions workflow `.github/workflows/ci.yml` runs `npm ci`, lint, vitest, and build on pushes/PRs to `main`.

## Nginx Configuration (Example)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/dfiu;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
