# FREE* Mediashare – Multi‑Channel YouTube Queue, Cups + Judging

FREE* Mediashare is a modern, multi‑channel media queue and gameshow toolkit for Twitch streamers. Each Twitch channel gets an isolated queue with real‑time updates, role‑based controls, Twitch chat integration, and a full “Cup” judging system with overlays for stream.

## Highlights

- Multi‑channel management with Twitch OAuth (one account, many channels)
- Real‑time per‑channel Socket.IO namespaces and overlay controls
- Robust queue with VIP, moderation, duplicate penalties, and history
- “Cups” judging system: 5‑decimal precision scores, lock/reveal flow, standings
- Per‑channel uploads: shuffle audio + soundboard controls
- Public Viewer Hub and production‑ready overlays (player, queue, leaderboard)
- Ad break auto‑announcements (EventSub + Ads API): 30‑sec pre‑warn + end message; per‑channel toggle with custom text
- Twitch bot: link detection + commands for producers/mods
- Prisma + PostgreSQL (SQLite supported for quick local dev)
- Secure by default: sessions, CSRF‑resistant flows, helmet CSP, rate limits

## Quick Start

### Option A: One‑command local dev

```bash
git clone https://github.com/kevin-huff/youtube-queue2.git
cd youtube-queue2
./start.sh
```

What you get:
- Installs root, server, and client deps
- Creates baseline env files from `.env.example`
- Pushes Prisma schema and starts DB (SQLite by default)
- Runs server on http://localhost:5000 and client on http://localhost:3000

### Option B: Manual local dev

Prereqs
- Node.js 18+
- SQLite (default) or PostgreSQL (recommended for prod)

Steps
```bash
# Install deps
npm run install:all

# Copy and edit envs
cp .env.example server/.env
cp client/.env client/.env.local  # optional override

# Initialize database (Prisma)
cd server
npm run db:setup   # npx prisma generate && npx prisma db push

# Start dev servers (root)
cd ..
npm run dev        # runs server + client with live reload
```

### Twitch setup (required)

1) Create a Twitch Application:
- Go to https://dev.twitch.tv/console/apps
- Create an app and set redirect URI to:
 `http://localhost:5000/api/auth/twitch/callback`
- Put `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` into `server/.env`
  - The app requests `channel:read:ads` to enable ad announcements.
  - Tokens are stored in the database (with refresh token + expiry) so subscriptions survive restarts.

2) Create a Twitch Bot account (optional but recommended):
- Create a separate Twitch account for the bot
- Get an OAuth token: https://twitchapps.com/tmi/
- Add to `server/.env`:
  - `TWITCH_BOT_USERNAME`
  - `TWITCH_BOT_OAUTH_TOKEN` (starts with `oauth:`)

3) (Optional) YouTube API key for richer metadata:
- `YOUTUBE_API_KEY` in `server/.env`

### Where to go
- Client: http://localhost:3000
- API:    http://localhost:5000
- Health: http://localhost:5000/health

## Core Concepts

### Roles and Access
- Ownership: `OWNER`, `MANAGER`
- Show roles: `PRODUCER`, `HOST`, `JUDGE`, `MODERATOR`
- Only owners/managers can change channel settings; producers/hosts run shows; judges score videos.

### Queue Engine
- Accepts YouTube, TikTok, Instagram links (validated + metadata fetched)
- VIP lane: 500+ bit cheers become VIP submissions (played before standard queue)
- Moderation and warnings with notes and status
- Duplicate penalty: if a video re‑appears, its score must beat the previous average or it counts as 0
- Top Eight mode for shows

### Cups and Judging
- Create cups, assign videos, start voting sessions per video
- Precision scores (0.00000–5.00000), manual or forced locks, comments
- Social/weighted average reveal and aggregate metrics
- Standings built with “shrunk top‑K” and baseline padding for fairer rankings
- Token‑based judge links (no Twitch login required):
  `POST /api/channels/:channelId/cups/:cupId/judge-link` → URL like
  `http://localhost:3000/judge/{channelId}/{cupId}?token={jwt}`

### Overlays (for OBS/Browser Source)
- Player overlay: `http://localhost:3000/player/{channel}`
  - Optional params: `?queue=hide` (hide mini‑queue), `&controls=show` (show test controls)
- Queue overlay: `http://localhost:3000/overlay/{channel}/queue`
- Leaderboard overlay: `http://localhost:3000/overlay/{channel}/leaderboard`
- Judge overlay: `http://localhost:3000/judge/{channel}/{cupId}/overlay`

Tip: In OBS, add a “Browser Source” at your canvas size (e.g., 1920×1080) and paste the overlay URL.

### Ad Announcements
- What it does: posts a warning message 30 seconds before ad breaks and a friendly message when ads end.
- How it works: integrates with Twitch EventSub (channel.ad_break.begin) and the Ads Schedule API. It runs per channel, automatically.
- Setup: broadcasters just log in (OAuth requests channel:read:ads). No extra bot commands or env tokens required.
- Configure: Owners/Managers open Dashboard → Producer tab → “Ad Announcements”. Toggle on/off and set the three messages. It’s enabled by default.
- Notes: announcements are API‑driven; manual `!ads` commands are not needed.

### Public Viewer Pages
- Viewer Hub: `http://localhost:3000/viewer/{channel}` (cups, standings, queue)
- Public Queue: `http://localhost:3000/channel/{channel}`

## Bot Commands

Per‑channel commands (moderators/broadcaster where noted):
- `!queue on` / `!queue off` — Enable/disable submissions (mods)
- `!skip` — Skip current video (mods)
- `!clear` — Clear the queue (mods)
- `!volume <0-100>` — Set player volume (mods)
- `!ban @user` / `!unban @user` — Block/allow submissions (mods)
- `!help` — Show available commands

URL messages with valid links are auto‑detected when the queue is enabled.

## API Quick Reference

Auth
- `GET /api/auth/twitch` — Start Twitch OAuth
- `GET /api/auth/twitch/callback` — OAuth callback
- `GET /api/auth/user` — Current user
- `POST /api/auth/logout` — Logout

Public (no auth)
- `GET /api/channels/public/:channel/queue` — Current queue
- `GET /api/channels/public/:channel/cups` — Public cups
- `GET /api/channels/public/:channel/cups/current` — Active cup
- `GET /api/channels/public/:channel/cups/:cupId/standings` — Cup standings

Producer/Admin
- `GET /api/channels` — Your channels
- `POST /api/channels` — Add channel
- `DELETE /api/channels/:channel` — Remove channel
- `GET /api/channels/:channel/queue/current` — Queue snapshot
- `POST /api/channels/:channel/queue/add` — Add video
- `POST /api/channels/:channel/queue/skip` — Skip current
- `DELETE /api/channels/:channel/queue/:itemId` — Remove item
- `PATCH /api/channels/:channel/settings/:key` — Update a setting
- `POST /api/channels/:channel/cups` — Create cup
- `PATCH /api/channels/:channel/cups/:cupId/set-active` — Activate a cup
- `POST /api/channels/:channel/cups/:cupId/judge-link` — Generate judge URL
  
Media (producer)
- `POST /api/channels/:channel/uploads/shuffle-audio` — Upload shuffle SFX (per‑channel)
- `GET /api/channels/:channel/soundboard` — List soundboard items
- `POST /api/channels/:channel/soundboard/upload` — Upload a soundboard clip
- `DELETE /api/channels/:channel/soundboard/:itemId` — Delete a clip
- `POST /api/channels/:channel/soundboard/play` — Trigger a clip to clients

Judge (token auth)
- `POST /api/channels/:channel/cups/:cupId/judge/session/start` — Start/reactivate session
- `POST /api/channels/:channel/cups/:cupId/items/:queueItemId/score` — Submit score
- `POST /api/channels/:channel/cups/:cupId/items/:queueItemId/lock` — Lock score
- `POST /api/channels/:channel/cups/:cupId/items/:queueItemId/unlock` — Unlock score
  
Soundboard (token auth)
- `GET /api/channels/:channel/cups/:cupId/soundboard` — List soundboard items (judge)
- `POST /api/channels/:channel/cups/:cupId/soundboard/play` — Trigger a clip (judge)

Health
- `GET /health` — Status, uptime, bot state, active channels

Note: This is a quick surface map; see `server/src/api/index.js` for the complete set.

## Environment

Server (`server/.env`) — see `.env.example` for defaults
```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname   # or file:./dev.db for SQLite

# Twitch OAuth
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_REDIRECT_URI=http://localhost:5000/api/auth/twitch/callback

# Twitch Bot (optional)
TWITCH_BOT_USERNAME=...
TWITCH_BOT_OAUTH_TOKEN=oauth:...

# YouTube (optional)
YOUTUBE_API_KEY=...

# Auth & sessions
JWT_SECRET=some_random_string
SESSION_SECRET=another_random_string

# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
CLIENT_URL=http://localhost:3000

# Uploads (optional; set for container volumes)
UPLOADS_DIR=/app/server/uploads

# Rate limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

Client (`client/.env`)
```env
REACT_APP_SERVER_URL=http://localhost:5000
```

## Development

Project layout
```
youtube-queue2/
├── client/                 # React frontend (overlays, judge, viewer, dashboard)
├── server/                 # Node/Express API + Socket.IO + Twitch bot
│   ├── prisma/             # Prisma schema (PostgreSQL; SQLite dev supported)
│   └── src/
│       ├── api/            # REST API routes
│       ├── auth/           # OAuth + judge tokens
│       ├── bot/            # tmi.js Twitch bot
│       ├── services/       # Channel/Queue/Judge services
│       └── socket/         # Per‑channel namespace events
└── docs/                   # Historical video data, notes
```

Useful scripts
- Root: `npm run dev` (server + client), `npm run build`, `npm run db:setup`
- Server: `npm run dev` (nodemon), `npm run db:migrate`, `npm run db:reset`, `npm run db:studio`
- Client: `npm start` / `npm run build`

Judge testing data
```bash
cd server
node test-phase2-setup.js
# Prints judge URLs like: http://localhost:3000/judge/test_channel/{cupId}?token=...
```

## Docker

Compose
```bash
docker-compose up --build
```
- Mounts `server/.env`, `server/data`, `server/logs`
- Exposes 5000 (API + static client). 3000 is mapped for compatibility.

Bare image
```bash
docker build -t youtube-queue .
docker run -p 5000:5000 youtube-queue
```

## Deployment

See DEPLOYMENT.md for production script options (`./start-production.sh`) and PM2/systemd helpers. The Dockerfile is Railway‑friendly and runs migrations on container start.

## License

Unlicense — see [LICENSE](LICENSE).

## Support

File issues and feature requests at https://github.com/kevin-huff/youtube-queue2/issues
