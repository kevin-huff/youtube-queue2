# YouTube Queue Bot - Dockerfile (Railway-friendly)
#
# This image uses a single builder + runner setup and skips Puppeteer's
# Chromium download to drastically speed up builds on Railway.

# Builder stage: install deps, build client, generate Prisma client
FROM node:22-bookworm-slim AS builder

# Prisma needs OpenSSL present to detect the correct engine target
# (debian-openssl-3.0.x); without it, it falls back to openssl-1.1.x engines
# that cannot load on bookworm.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Avoid downloading ~100MB Chromium during install (we don't need it at build)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

# Copy package manifests for root and workspaces
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Speed up npm and avoid extra metadata
RUN npm config set fund false && npm config set audit false && npm config set progress false

# Install only required workspaces with production deps to reduce build time
# - client: includes react-scripts in dependencies, sufficient for build
# - server: prod deps only
RUN npm ci --omit=dev --no-audit --no-fund --workspace server --workspace client

# Install the repo-pinned Prisma CLI (matches @prisma/client in the lockfile)
# without touching package.json. It stays in node_modules so the entrypoint can
# run `prisma migrate deploy` at boot without downloading anything.
RUN npm install --no-save --omit=dev --no-audit --no-fund prisma@6.16.2

# Copy source and build the client
COPY . .
RUN cd client && npm run build

# Generate the Prisma client at BUILD time (outputs to node_modules/.prisma
# and node_modules/@prisma/client, both copied into the final image below)
RUN cd server && npx --no-install prisma generate


### Final image: copy only what we need for runtime
FROM node:22-bookworm-slim AS runner

# OpenSSL is required at runtime by the Prisma query/schema engines
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Keep environment lean and production-focused. HOME/NPM_CONFIG_CACHE point
# at /tmp because the `app` system user has no home directory (/nonexistent),
# which otherwise breaks npx's cache/log writes at boot.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    HOME=/tmp \
    NPM_CONFIG_CACHE=/tmp/.npm

# Copy production node_modules and server code from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server

# Copy built client into server public so Express can serve it
COPY --from=builder /app/client/build ./server/public

# Copy entrypoint and package files if needed
COPY --from=builder /app/start-production-container.sh ./start-production-container.sh
COPY --from=builder /app/package*.json ./

# Make entrypoint executable and set ownership
RUN chmod +x ./start-production-container.sh

# Run as non-root user
RUN addgroup --system app && adduser --system --ingroup app app
RUN chown -R app:app /app
USER app

# Expose server port (app also serves static client)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD node server/src/health-check.js || exit 1

# Start command (entrypoint will run migrations then start server)
CMD ["/app/start-production-container.sh"]
