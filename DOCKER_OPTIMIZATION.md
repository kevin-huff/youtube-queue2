# Docker Build Optimization

This document explains the Docker build optimizations implemented for Railway deployment.

## Changes Made

### 1. `.dockerignore` File
Added a comprehensive `.dockerignore` file to exclude unnecessary files from the Docker build context:
- `.git` directory and git-related files
- `node_modules` (installed fresh in container)
- Database files in `db/` (runtime data, initialized with defaults)
- Log files
- Documentation files
- Glitch-specific configuration files
- Build artifacts and cache directories

**Result**: Build context reduced from ~155MB to ~0.7MB (99.5% reduction)

### 2. Optimized `Dockerfile`
Created a multi-stage Dockerfile with the following optimizations:

#### Stage 1: Builder
- Uses `node:16-alpine` (smaller base image)
- Copies only `package*.json` first for better layer caching
- Installs production dependencies
- Cleans npm cache to reduce image size

#### Stage 2: Production
- Uses fresh `node:16-alpine` base
- Copies pre-built `node_modules` from builder stage
- Copies only necessary application files
- Initializes empty database files for runtime
- Runs as non-root user for security
- Sets `NODE_ENV=production`

## Benefits

1. **Faster Builds**: 
   - Smaller build context means faster upload to Railway
   - Layer caching ensures dependencies are only reinstalled when package.json changes
   - Multi-stage build reduces final image size

2. **Reduced Build Timeouts**: 
   - Excluding 155MB of unnecessary files prevents Railway build timeouts
   - Database files are initialized in the container, not copied from source

3. **Better Security**:
   - Runs as non-root user
   - Only includes necessary files
   - No sensitive data in build context

4. **Improved Caching**:
   - Package files copied separately for optimal layer caching
   - Dependencies cached between builds when package.json unchanged

## Build Time Comparison

- **Before**: Build context ~155MB + reinstalling all dependencies every time
- **After**: Build context ~0.7MB + dependency layer caching

## Railway Deployment

Railway will automatically detect and use the Dockerfile. No additional configuration needed.

## Local Testing

To build locally:
```bash
docker build -t youtube-queue .
```

To run locally:
```bash
docker run -p 3000:3000 --env-file .env youtube-queue
```

## Notes

- Database files (`db/*.json`) are excluded from the build and initialized with empty defaults
- Runtime data will be managed by the application itself
- Large media files are copied but could be served from CDN in production
