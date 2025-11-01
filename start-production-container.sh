#!/bin/sh
set -e

# Minimal entrypoint for production container on Railway/containers.
# - Runs prisma migrations if DATABASE_URL is set
# - Starts the server in production mode

echo "[entrypoint] Starting container entrypoint"

# If a .env file exists, export it for local runs (Railway normally provides env)
if [ -f "server/.env" ]; then
  echo "[entrypoint] Found server/.env — exporting variables for migration step"
  set -a
  # shellcheck disable=SC1091
  . server/.env
  set +a
elif [ -f ".env" ]; then
  echo "[entrypoint] Found .env — exporting variables for migration step"
  set -a
  # shellcheck disable=SC1091
  . .env
  set +a
fi

# Prisma helpers
PRISMA_SCHEMA="server/prisma/schema.prisma"
PRISMA_CMD="npx prisma --schema ${PRISMA_SCHEMA}"

if [ -n "${DATABASE_URL}" ]; then
  echo "[entrypoint] DATABASE_URL detected — running prisma migrations"
  # Try migrate deploy; if it fails (no migrations) fall back to db push
  if ${PRISMA_CMD} migrate deploy; then
    echo "[entrypoint] Migrations deployed successfully"
  else
    echo "[entrypoint] migrate deploy failed, trying prisma db push"
    ${PRISMA_CMD} db push
  fi
  # Ensure Prisma client is generated for runtime
  echo "[entrypoint] Generating Prisma client"
  ${PRISMA_CMD} generate
else
  echo "[entrypoint] No DATABASE_URL — skipping migrations"
fi

# Start server (root package.json start:production delegates to server)
exec npm run start:production
