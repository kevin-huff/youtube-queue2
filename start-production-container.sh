#!/bin/sh
set -e

# Minimal entrypoint for production container on Railway/containers.
# - Runs `prisma migrate deploy` (the ONLY schema step) if DATABASE_URL is set
# - Starts the server in production mode
#
# The Prisma client is generated at image build time (see Dockerfile) and the
# prisma CLI is baked into node_modules at the repo-pinned version, so nothing
# is downloaded from the npm registry at boot.

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

if [ -n "${DATABASE_URL}" ]; then
  echo "[entrypoint] DATABASE_URL detected — running prisma migrate deploy"
  (
    cd server
    if npx --no-install prisma migrate deploy; then
      echo "[entrypoint] Migrations deployed successfully"
    else
      if [ "${PRISMA_DB_PUSH_FALLBACK}" = "true" ]; then
        echo "[entrypoint] ############################################################"
        echo "[entrypoint] # WARNING: migrate deploy FAILED and PRISMA_DB_PUSH_FALLBACK"
        echo "[entrypoint] # is enabled — falling back to 'prisma db push'. This is a"
        echo "[entrypoint] # break-glass path only: it bypasses migration history and"
        echo "[entrypoint] # can mask real migration failures. Unset it once resolved."
        echo "[entrypoint] ############################################################"
        npx --no-install prisma db push --skip-generate
      else
        echo "[entrypoint] ERROR: prisma migrate deploy failed. Refusing to start." >&2
        echo "[entrypoint]" >&2
        echo "[entrypoint] If this is a P3005 error (database schema is not empty, no" >&2
        echo "[entrypoint] migration history), this database was provisioned with 'db push'" >&2
        echo "[entrypoint] and must be baselined ONCE — mark the historical migrations as" >&2
        echo "[entrypoint] already applied, then redeploy:" >&2
        echo "[entrypoint]   for m in server/prisma/migrations/2*/; do" >&2
        echo "[entrypoint]     npx prisma migrate resolve --applied \"\$(basename \"\$m\")\"" >&2
        echo "[entrypoint]   done" >&2
        echo "[entrypoint]" >&2
        echo "[entrypoint] To temporarily restore the old behavior instead, set" >&2
        echo "[entrypoint] PRISMA_DB_PUSH_FALLBACK=true (break-glass only — unset it after)." >&2
        exit 1
      fi
    fi
  )
else
  echo "[entrypoint] No DATABASE_URL — skipping migrations"
fi

# Start node directly — no npm wrapper. npm swallows SIGTERM into a spurious
# "command failed, signal SIGTERM" error block on every graceful shutdown,
# which reads like a crash in the deploy logs. The server handles SIGTERM
# itself (see server/src/index.js shutdown handlers).
cd server
exec env NODE_ENV=production node src/index.js
