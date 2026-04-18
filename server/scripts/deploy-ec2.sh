#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Capstone}"
PM2_APP_NAME="${PM2_APP_NAME:-autograde-backend}"

echo "[deploy] app dir: $APP_DIR"
cd "$APP_DIR"

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
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt
  cd "$APP_DIR"
fi

echo "[deploy] reloading backend with PM2"
cd server
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] complete"
