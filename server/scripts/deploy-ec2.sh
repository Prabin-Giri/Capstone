#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Capstone}"
PM2_APP_NAME="${PM2_APP_NAME:-autograde-backend}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Support both repo root (~/Capstone) and backend dir (~/Capstone/server).
if [ -d "$APP_DIR/server" ]; then
  :
elif [ -d "$APP_DIR" ] && [ "$(basename "$APP_DIR")" = "server" ]; then
  APP_DIR="$(dirname "$APP_DIR")"
elif [ -d "$SCRIPT_APP_DIR/server" ]; then
  APP_DIR="$SCRIPT_APP_DIR"
elif [ -d "$HOME/Capstone/server" ]; then
  APP_DIR="$HOME/Capstone"
else
  echo "[deploy] could not locate repository root from APP_DIR=$APP_DIR"
  exit 1
fi

echo "[deploy] app dir: $APP_DIR"
cd "$APP_DIR"

# 1. Integrate Cleanup
if [ -f "server/scripts/cleanup-ec2.sh" ]; then
  echo "[deploy] running disk cleanup before installation..."
  bash server/scripts/cleanup-ec2.sh
fi

# 2. Disk Space Check
AVAIL_MB=$(df -m / | tail -n 1 | awk '{print $4}')
if [ "$AVAIL_MB" -lt 500 ]; then
  echo "[deploy] WARNING: Critically low disk space ($AVAIL_MB MB available)."
  echo "[deploy] Attempting more aggressive cleanup..."
  rm -rf offline_ai_detector/.venv || true
fi

if [ -f "$APP_DIR/.env" ]; then
  echo "[deploy] loading env vars from $APP_DIR/.env"
  set -a
  # shellcheck disable=SC1090
  . "$APP_DIR/.env"
  set +a
fi

echo "[deploy] fetching latest main"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[deploy] installing backend dependencies"
cd server
npm ci --omit=dev
cd "$APP_DIR"

if [ "${AI_DETECTOR_ENABLED:-false}" = "true" ]; then
  echo "[deploy] AI detector is enabled; installing detector python dependencies"
  cd offline_ai_detector
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
  fi
  .venv/bin/python -m pip install --upgrade pip --no-cache-dir
  # If installation fails once, try cleaning .venv and retrying
  if ! .venv/bin/python -m pip install -r requirements.txt --no-cache-dir; then
    echo "[deploy] Pip install failed. Retrying with fresh .venv..."
    cd ..
    rm -rf offline_ai_detector/.venv
    cd offline_ai_detector
    python3 -m venv .venv
    .venv/bin/python -m pip install --upgrade pip --no-cache-dir
    .venv/bin/python -m pip install -r requirements.txt --no-cache-dir
  fi
  cd "$APP_DIR"
fi

echo "[deploy] reloading backend with PM2"
cd server
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] complete"
