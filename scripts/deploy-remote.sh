#!/bin/bash
# scripts/deploy-remote.sh

# Exit on error
set -e

# Load .env variables if present
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '#' | xargs)
fi

for var_name in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_MAPBOX_TOKEN; do
  value="${!var_name}"
  if [ -z "$value" ] || [[ "$value" == your_* ]] || [[ "$value" == *YOUR_PROJECT* ]]; then
    echo "Error: $var_name is not configured for deployment."
    echo "Set real Vite production values in .env.local before running npm run deploy."
    exit 1
  fi
done

if [[ "$VITE_SUPABASE_URL" != https://*.supabase.co ]]; then
  echo "Error: VITE_SUPABASE_URL must be a Supabase HTTPS project URL."
  exit 1
fi

# Default Configuration
USER=${DEPLOY_USER:-$(whoami)}
HOST=${DEPLOY_HOST:-"web"}
DIR=${DEPLOY_DIR:-"/var/www/dfiu"}

# Check required variables
if [ -z "$HOST" ]; then
  echo "Error: DEPLOY_HOST is not set."
  echo "Please set DEPLOY_HOST in your .env file or environment."
  echo "Example: DEPLOY_HOST=192.168.1.100"
  exit 1
fi

echo "🚀 Starting Deployment to $USER@$HOST:$DIR"

# 1. Build
echo "📦 Building project..."
npm ci
npm run build

# 2. Deploy
echo "📤 Syncing files to remote server..."
# Upload hashed Vite assets without deleting old ones. Open browser tabs can
# lazy-load an older chunk after a deploy, so pruning assets causes 404s.
if [ -d dist/assets ]; then
  ssh "$USER@$HOST" "mkdir -p '$DIR/assets'"
  rsync -avz dist/assets/ "$USER@$HOST:$DIR/assets/"
fi

# Replace the app shell and other root files, but leave historical assets in
# place so already-loaded app versions can finish loading their chunks.
rsync -avz --delete --exclude '/assets/***' dist/ "$USER@$HOST:$DIR/"

# rsync -a preserves local permissions, which can leave files unreadable by the
# web server (caused a production 500 on a prior deploy). Normalize on every run.
echo "🔐 Normalizing remote file permissions..."
ssh "$USER@$HOST" "find '$DIR' -type d -exec chmod 755 {} + && find '$DIR' -type f -exec chmod 644 {} +"

echo "✅ Deployment Complete!"
echo "   App should be live at http://$HOST (assuming default Nginx setup)"
