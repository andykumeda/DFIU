# Deployment Guide

This guide explains how to deploy the "Don't F* It Up" (DFIU) application from your local development machine (Mac) to a remote Linux production server.

## Prerequisites

1.  **Remote Server**: A Linux server (e.g., Ubuntu/Debian) with SSH access.
2.  **Web Server**: Nginx (or Apache) installed and configured to serve static files from the target directory (default: `/var/www/dfiu`).
3.  **Permissions**: The SSH user must have write permissions to the target directory.
    *   *Recommended*: Change ownership of the folder to your user: `sudo chown -R $USER:$USER /var/www/dfiu`

## Configuration

Add the following variables to your local `.env` file (do not commit this file if it contains secrets):

```bash
# Deployment Configuration
DEPLOY_USER=your_ssh_username
DEPLOY_HOST=your_server_ip_or_domain
DEPLOY_DIR=/var/www/dfiu
```

If `DEPLOY_USER` is omitted, the deploy script uses the current local username. The current production directory is writable by the `andy` SSH user, not `root`.

## Deployment Steps

### 1. Frontend Deployment (Static Files)

We use a script to build the React application locally and `rsync` the files to the remote server.

Run the following command from the project root:

```bash
npm run deploy
```

**What this does:**
1.  Installs exact dependencies with `npm ci`.
2.  Builds the project locally (`npm run build`).
3.  Connects to `DEPLOY_HOST` via SSH.
4.  Syncs the contents of `dist/` to `DEPLOY_DIR` on the server using `rsync`.

After deploy, compare the app footer/build label with:

```bash
git describe --always --dirty --abbrev=7
```

### 2. Backend Deployment (Supabase Edge Functions)

Since the backend logic runs on Supabase Edge Functions, you deploy them directly to Supabase, not your Linux server.

Run these commands when the corresponding function changes:

```bash
supabase functions deploy strava-auth --no-verify-jwt
supabase functions deploy invite-race-member
```

*Note: Ensure you have logged in via `supabase login` and linked your project.*

Current Supabase-backed features also depend on applying migrations in `supabase/migrations/`, including RBAC memberships, pending invites, DB-backed pace plans, and runner check-ins.

## Nginx Configuration (Example)

Your remote server's Nginx config (usually in `/etc/nginx/sites-available/dfiu`) should look something like this to handle client-side routing:

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
