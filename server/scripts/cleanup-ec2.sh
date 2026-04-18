#!/usr/bin/env bash
# server/scripts/cleanup-ec2.sh
# Run this script on the EC2 instance to free up disk space.

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Capstone}"
echo "[cleanup] Starting disk cleanup in $APP_DIR"

# 1. Clean System Package Cache
echo "[cleanup] Cleaning system package cache..."
sudo apt-get clean || true

# 2. Clean Node.js / NPM Cache
echo "[cleanup] Cleaning NPM cache..."
npm cache clean --force || true

# 3. Clean Python PIP Cache
echo "[cleanup] Cleaning PIP cache..."
if [ -d "$APP_DIR/offline_ai_detector/.venv" ]; then
    "$APP_DIR/offline_ai_detector/.venv/bin/python" -m pip cache purge || true
fi
python3 -m pip cache purge || true

# 4. Flush PM2 Logs (Often the biggest culprit)
echo "[cleanup] Flushing PM2 logs..."
pm2 flush || true

# 5. Remove Temporary AI Detector Files
echo "[cleanup] Removing temporary AI detector files..."
rm -rf /tmp/ai-detector-* || true

# 6. Check Disk Space
echo "[cleanup] Cleanup complete. Current disk usage:"
df -h /
