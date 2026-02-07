#!/bin/bash
set -e

TARGET_DIR="/var/www/dfiu"

echo "Building project..."
npm install && npm run build

echo "Deploying to $TARGET_DIR..."
# Ensure target exists
sudo mkdir -p "$TARGET_DIR"

# Clean and Copy
sudo rm -rf "$TARGET_DIR"/*
sudo cp -r dist/* "$TARGET_DIR/"

# Set Permissions (optional but good practice)
sudo chown -R $USER:$USER "$TARGET_DIR"

echo "Deployment complete!"
