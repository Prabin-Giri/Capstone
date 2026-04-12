#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Capstone}"
PM2_APP_NAME="${PM2_APP_NAME:-autograde-backend}"

echo "[deploy] app dir: $APP_DIR"
cd "$APP_DIR"

echo "[deploy] fetching latest main"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[deploy] installing backend dependencies"
cd server
npm ci --omit=dev

echo "[deploy] reloading backend with PM2"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] complete"
