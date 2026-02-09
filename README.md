# Don't F* It Up (DFIU)

**Race planning for 100-mile+ trail runners who obsess over the details.**

DFIU helps you centralize your course, pace plan, logistics, and crew info in one place. It provides insights to ensure you don't "F* It Up" on race day.

## Tech Stack

-   **Frontend:** React 19 + Vite 6
-   **Routing:** React Router v7
-   **State Management:** TanStack Query v5
-   **Styling:** Tailwind CSS v4
-   **Backend / Auth:** Supabase
-   **Maps:** Mapbox GL JS

## Getting Started

### Prerequisites

-   Node.js (v18+)
-   NPM

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository_url>
    cd dfiu-web
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure environment variables:
    Create a `.env` or `.env.local` file with the following keys:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_MAPBOX_TOKEN=your_mapbox_token
    ```

4.  Start the development server:
    ```bash
    npm run dev
    ```

## Scripts

-   `npm run dev`: Start the development server.
-   `npm run build`: Build the application for production.
-   `npm run deploy`: Build and deploy the application to `/var/www/dfiu` (requires sudo permissions).
-   `npm run lint`: Run ESLint.

## Deployment

The application is deployed as a static site served by Nginx.

To deploy:
```bash
npm run deploy
```
This script builds the app and copies the `dist/` folder to `/var/www/dfiu`.

## Directory Structure

-   `src/features/` - Domain logic (Auth, Race, Course).
-   `src/pages/` - Application routes/pages.
-   `src/lib/` - Shared utilities (Supabase, Geo utils).
-   `src/components/` - Shared UI components.