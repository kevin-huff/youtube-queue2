# Use Node.js 16 as specified in package.json
FROM node:16-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
COPY package*.json ./

# Install dependencies
# Use npm install with production flag for Railway compatibility
RUN npm install --production && \
    npm cache clean --force

# Production stage
FROM node:16-alpine

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package*.json ./
COPY server.js ./
COPY views ./views
COPY public ./public

# Create db directory for runtime data (will be populated at runtime)
RUN mkdir -p db && \
    echo '{}' > db/login.json && \
    echo '{}' > db/social_scores.json && \
    echo '{}' > db/youtube.json && \
    echo '{}' > db/historical_youtube.json && \
    echo '{}' > db/moderation.json && \
    echo '{}' > db/giveaways.json && \
    echo '{}' > db/tokens.json && \
    echo '{"open":false,"maxVidsPerUser":3}' > db/queue_settings.json

# Set NODE_ENV to production
ENV NODE_ENV=production

# Expose port (Railway will use PORT env variable)
EXPOSE 3000

# Use non-root user for security
USER node

# Start the application
CMD ["node", "server.js"]
