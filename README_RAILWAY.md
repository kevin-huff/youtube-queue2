# Deploying youtube-queue2 to Railway

This guide shows the minimal steps to deploy the project to Railway. The repo is a monorepo with `server` and `client` workspaces. The server listens on port 5000 by default and serves the API and websockets.

## What I added
- `Procfile` — starts the server in production (`cd server && npm run start:production`).
- `server` now has a `release` script (see notes) to run Prisma migrations on deploy.

## Recommended Railway setup (quick)
1. Create a new Railway project and connect your GitHub repo.
2. For the service, choose "Deploy from GitHub" and select the branch you want to deploy.
3. Railway will detect Node (monorepo). In the service settings you'll want to ensure the build and start commands are appropriate.

### Build command (if Railway asks)
Use a build step that installs and builds the client:

```
# from repo root (Railway web build step)
npm ci && cd client && npm ci && npm run build && cd ../server && npm ci && npx prisma generate
```

Railway typically runs `npm install` automatically. If it does, you can instead use:

```
cd client && npm run build && cd ../server && npx prisma generate
```

### Start command
The `Procfile` I added sets the start command. Railway uses the `Procfile` by default. The file contains:

```
web: cd server && npm run start:production
```

This runs the server's `start:production` script which starts `server/src/index.js`.

## Required environment variables
Set these in Railway -> Variables (Environment Variables / Secrets):

- `DATABASE_URL` - Postgres connection string (used by Prisma). Create a Postgres plugin in Railway and copy the generated URL.
- `SESSION_SECRET` - session secret for express-session.
- `TWITCH_BOT_USERNAME` - (optional) bot username if you use Twitch bot features.
- `TWITCH_BOT_OAUTH_TOKEN` - (optional) OAuth token for the Twitch bot.
- `CORS_ORIGIN` - origin for CORS (e.g. your deployed client url). Defaults to `http://localhost:3000`.
- `NODE_ENV` - set to `production`.
- `PORT` - optional; server defaults to 5000.
- Any other API keys the app expects (YouTube API key, etc.)

## Running Prisma migrations on Railway
Railway provides a console/CLI where you can run commands against your deployed container.

Options:
1. Run migrations manually in Railway's console (recommended first deploy):
   - Open the service, choose "Connect" -> "Open a Shell", then run:
     ```bash
     cd server
     npx prisma migrate deploy
     ```
   - Then run `npx prisma generate` if needed.

2. Add a release script in `server/package.json` and let Railway run it on deploy (I added `release` script to help):
   - Example (already added to `server/package.json`):
     ```json
     "release": "npx prisma migrate deploy"
     ```
   - In Railway, set Release Command to `npm --prefix server run release` (if Railway supports release commands) or configure a deploy hook to run the command.

## Deploying with Docker (alternative)
There is a top-level `Dockerfile`. You can deploy the Docker image to Railway by setting the project to use the Dockerfile. That method will build client and server inside Docker like your repo's Dockerfile does.

## Post-deploy checks
- Visit `/health` on your deployed service to verify status. Example: `https://<your-service>.up.railway.app/health`.
- Verify websockets by connecting the client (set `CORS_ORIGIN`).
- If Twitch bot is used, ensure Twitch tokens are present and valid.

## Local verification commands
From repo root:

```
# install dependencies for workspaces
npm ci
# build client
cd client && npm run build
# generate prisma client
cd ../server && npx prisma generate
# run server in production mode (locally)
npm run start:production
```

If you need, I can add a `release` script to the root package.json or add a Railway-specific config file; tell me if you want me to also add automated migration in CI/deploy.
