# YouTube Queue Bot - Dockerfile (Railway-friendly)
#
# This image uses a single builder + runner setup and skips Puppeteer's
# Chromium download to drastically speed up builds on Railway.

# Builder stage: install deps, build client, generate Prisma client
FROM node:18-bullseye-slim AS builder

WORKDIR /app

# Avoid downloading ~100MB Chromium during install (we don't need it at build)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

# Copy package manifests for root and workspaces
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install all dependencies (including dev) to support client build & prisma generate
RUN npm ci

# Copy source and build the client
COPY . .
RUN cd client && npm run build

# Generate Prisma client
RUN cd server && npx prisma generate

# Remove dev dependencies to keep node_modules production-only
RUN npm prune --production


### Final image: copy only what we need for runtime
FROM node:18-bullseye-slim AS runner

WORKDIR /app

# Keep environment lean and production-focused
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

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

# Expose server port (app also serves static client)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD node server/src/health-check.js || exit 1

# Start command (entrypoint will run migrations then start server)
CMD ["/app/start-production-container.sh"]
