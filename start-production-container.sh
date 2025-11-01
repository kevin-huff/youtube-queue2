#!/bin/sh
set -e

# Minimal entrypoint for production container on Railway/containers.
# - Runs prisma migrations if DATABASE_URL is set
# - Starts the server in production mode

echo "[entrypoint] Starting container entrypoint"

# If a .env file exists in the app root, export its variables so this shell
# (used for running migrations) picks them up. This ensures migrations run
# inside the container even when running without --env-file at runtime.
if [ -f ".env" ]; then
  echo "[entrypoint] Found .env — exporting variables for migration step"
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

if [ -n "${DATABASE_URL}" ]; then
  echo "[entrypoint] DATABASE_URL detected — running prisma migrate deploy"
  # Try migrate deploy; if it fails (no migrations) fall back to db push
  if npx prisma migrate deploy; then
    echo "[entrypoint] Migrations deployed successfully"
  else
    echo "[entrypoint] migrate deploy failed, trying prisma db push"
    npx prisma db push
  fi
else
  echo "[entrypoint] No DATABASE_URL — skipping migrations"
fi

# Start server (root package.json start:production delegates to server)
exec npm run start:production
