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

## Deployment Steps

### 1. Frontend Deployment (Static Files)

We use a script to build the React application locally and `rsync` the files to the remote server.

Run the following command from the project root:

```bash
./scripts/deploy-remote.sh
```

**What this does:**
1.  Builds the project locally (`npm run build`).
2.  Connects to `DEPLOY_HOST` via SSH.
3.  Syncs the contents of `dist/` to `DEPLOY_DIR` on the server using `rsync`.

### 2. Backend Deployment (Supabase Edge Functions)

Since the backend logic runs on Supabase Edge Functions, you deploy them directly to Supabase, not your Linux server.

Run this command:

```bash
supabase functions deploy strava-auth --no-verify-jwt
```

*Note: Ensure you have logged in via `supabase login` and linked your project.*

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
