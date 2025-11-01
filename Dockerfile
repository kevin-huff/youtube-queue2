# YouTube Queue Bot - Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci --only=production
RUN cd server && npm ci --only=production
RUN cd client && npm ci --only=production

# Copy source code
COPY . .

# Build client
RUN cd client && npm run build

# Copy built client into server public so the Express server can serve static files
RUN mkdir -p server/public
RUN cp -R client/build/* server/public/ || true

# Multi-stage Dockerfile
# Builder stage: install deps, build client, generate Prisma client
FROM node:18-bullseye-slim AS builder

WORKDIR /app

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
