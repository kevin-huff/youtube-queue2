# YouTube Queue Bot - Dockerfile
# Multi-stage build for optimized Docker image size and build speed

# Builder stage: install deps, build client, generate Prisma client
FROM node:18-bullseye-slim AS builder

WORKDIR /app

# Copy package manifests for root and workspaces
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies for all workspaces (leveraging layer caching)
# This layer will be cached unless package*.json files change
RUN npm ci

# Copy Prisma schema and generate client (small layer, changes infrequently)
COPY server/prisma ./server/prisma
RUN cd server && npx prisma generate

# Copy and build client (separate layer for better caching)
COPY client ./client
RUN cd client && npm run build

# Copy server source files
COPY server/src ./server/src

# Copy runtime scripts and config
COPY start-production-container.sh ./

# Prune dev dependencies
RUN npm prune --production


### Final image: copy only what we need for runtime
FROM node:18-bullseye-slim AS runner

WORKDIR /app

# Copy production node_modules and server code from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server

# Copy built client into server public so Express can serve it
COPY --from=builder /app/client/build ./server/public

# Copy entrypoint and package files if needed
COPY --from=builder /app/start-production-container.sh ./start-production-container.sh
COPY --from=builder /app/package*.json ./

# Make entrypoint executable and set ownership
RUN chmod +x ./start-production-container.sh \
    && addgroup --system nodejs \
    && adduser --system --ingroup nodejs nextjs \
    && chown -R nextjs:nodejs /app

USER nextjs

# Expose ports used by server
EXPOSE 3000 5000

# Health check (runs as non-root user)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node server/src/health-check.js || exit 1

# Start command (entrypoint will run migrations then start server)
CMD ["/app/start-production-container.sh"]
