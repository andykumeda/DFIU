# Migration Completed: Vite Single Page Application

## Executive Summary
The application "Don't F* It Up" (DFIU) has been successfully migrated from a **Next.js SSR** architecture to a **Vite Single Page Application (SPA)**. This change was made to ensure stability, eliminate memory leaks, and remove port conflicts on the shared hosting environment.

## Current Architecture

| Component | New Stack | Benefits |
| :--- | :--- | :--- |
| **Frontend** | **React 19 + Vite 6** | Fast builds, no server-side rendering crashes. |
| **Routing** | **React Router v7** | Client-side routing, standard SPA behavior. |
| **Auth** | **Supabase Auth (Client)** | Direct session management, no middleware middleware. |
| **Data** | **TanStack Query** | Robust caching, loading states, optimistic updates. |
| **Styling** | **Tailwind CSS v4** | Modern, zero-config styling. |
| **Hosting** | **Nginx Static Files** | Served from `/var/www/dfiu`. Uncrashable. |

## Deployment Guide

The deployment process is now fully automated and zero-downtime (for the user, as files are swapped instantly).

### 1. Run the Script
From the project root (`~/Dev/DFIU`):
```bash
npm run deploy
```

### 2. What it Does
1.  **Builds** the project (`vite build`) to `dist/`.
2.  **Cleans** the target directory `/var/www/dfiu` (preserving nothing, as it's purely static).
3.  **Copies** the new build artifacts to the target.
4.  **No Restart Needed:** Nginx picks up the changes immediately.

## Directory Structure
- `src/features/` - Domain logic (Auth, Race, Course).
- `src/pages/` - Route wrappers.
- `src/lib/` - Shared utilities (Supabase client, Geo math).
- `src/components/ui/` - Shared dumb components.

## Troubleshooting
- **White Screen:** Check browser console. Likely an environment variable issue or a runtime crash caught by the Error Boundary.
- **404 on Refresh:** Ensure Nginx is configured with `try_files $uri $uri/ /index.html;`.
- **Map Not Loading:** Verify `VITE_MAPBOX_TOKEN` in `.env.local`.
