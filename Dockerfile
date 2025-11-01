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

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create db directory for runtime data (will be populated at runtime)
# Initialize with proper permissions for node user
RUN mkdir -p db && \
    echo '{}' > db/login.json && \
    echo '{}' > db/social_scores.json && \
    echo '{}' > db/youtube.json && \
    echo '{}' > db/historical_youtube.json && \
    echo '{}' > db/moderation.json && \
    echo '{}' > db/giveaways.json && \
    echo '{}' > db/tokens.json && \
    echo '{"last_turn_type":false,"deeze_nutz":0,"turn_count":0,"youtubes_watched":0,"total_youtubes_watched":0,"giveaway":{"isOpen":false,"tokens":30,"secretWord":""},"youtube_open":false}' > db/queue_settings.json && \
    chown -R node:node /app/db

# Expose default port (Railway will override via PORT env variable)
# The application uses process.env.PORT || 3000
EXPOSE 3000

# Use non-root user for security
USER node

# Start the application
CMD ["node", "server.js"]
