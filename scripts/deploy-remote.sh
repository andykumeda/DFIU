#!/bin/bash
# scripts/deploy-remote.sh

# Exit on error
set -e

# Load .env variables if present
# Load .env variables if present
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '#' | xargs)
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
# Using rsync for efficient delta transfer
# -a: archive mode (preserves permissions, etc)
# -v: verbose
# -z: compress during transfer
# --delete: remove files on remote that no longer exist locally
rsync -avz --delete dist/ "$USER@$HOST:$DIR/"

echo "✅ Deployment Complete!"
echo "   App should be live at http://$HOST (assuming default Nginx setup)"
