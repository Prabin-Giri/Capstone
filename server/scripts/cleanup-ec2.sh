#!/usr/bin/env bash
# server/scripts/cleanup-ec2.sh
# Run this script on the EC2 instance to free up disk space.

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Capstone}"
echo "[cleanup] Starting disk cleanup..."

# Function to show disk usage
show_disk_usage() {
    echo "[cleanup] Current disk usage on /:"
    df -h / | tail -n 1 | awk '{print "Total: "$2", Used: "$3", Avail: "$4" ("$5")"}'
}

show_disk_usage

# 1. Clean System Packages
echo "[cleanup] Cleaning system packages..."
sudo apt-get clean || true
sudo apt-get autoremove -y || true

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
echo "[cleanup] Removing temporary files..."
rm -rf /tmp/ai-detector-* || true
rm -rf "$APP_DIR/offline_ai_detector/model_cache/"* || true

# 6. Final Report
echo "[cleanup] Cleanup complete."
show_disk_usage
