#!/usr/bin/env bash
# deploy-ec2.sh — Automated backend deployment with disk-safe installation
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Capstone}"
PM2_APP_NAME="${PM2_APP_NAME:-autograde-backend}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    echo "[deploy] loading env vars from $env_file"
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
  fi
}

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

# Load root and server env files (if present). Root .env supports monorepo setups;
# server/.env supports legacy EC2 setups.
load_env_file "$APP_DIR/.env"
load_env_file "$APP_DIR/server/.env"

# Backward-compatible aliases for older EC2 env names.
export MYSQL_HOST="${MYSQL_HOST:-${DB_HOST:-}}"
export MYSQL_PORT="${MYSQL_PORT:-${DB_PORT:-}}"
export MYSQL_USER="${MYSQL_USER:-${DB_USER:-}}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-${DB_PASSWORD:-${DB_PASS:-}}}"
export MYSQL_DATABASE="${MYSQL_DATABASE:-${DB_NAME:-}}"
export AWS_S3_BUCKET="${AWS_S3_BUCKET:-${S3_BUCKET_NAME:-}}"

echo "[deploy] fetching latest main"
git fetch origin main
git checkout main
git reset --hard origin/main
git clean -fd -e .env -e server/.env

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

  # Install torch CPU-only FIRST from PyTorch's CPU index.
  # The default torch now ships ~2.7GB of CUDA/nvidia libraries.
  # This EC2 has no GPU, so CPU-only (~200MB) is all we need.
  echo "[deploy] installing torch (CPU-only)..."
  .venv/bin/python -m pip install torch --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu

  # Install remaining requirements. torch is already satisfied so pip skips it.
  echo "[deploy] installing remaining python dependencies..."
  .venv/bin/python -m pip install -r requirements.txt --no-cache-dir

  cd "$APP_DIR"
fi

echo "[deploy] reloading backend with PM2"
cd server
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] complete"
