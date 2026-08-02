# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

YouTube Queue 2 is a real-time video queue and gameshow platform for Twitch streamers. Viewers submit videos (YouTube, TikTok, Instagram) via chat or web interface, and producers manage playback, judging, and cup tournaments through a dashboard with OBS overlays.

## Commands

### Development
```bash
npm run install:all        # Install root + server + client deps
npm run dev                # Run server (5000) + client (3000) concurrently
npm run dev:server         # Server only with nodemon
npm run dev:client         # React dev server only
```

### Database
```bash
npm run db:setup           # prisma generate + db push
npm run db:migrate         # prisma migrate dev
npm run db:reset           # Force reset (destructive)
npm run db:studio          # Prisma Studio GUI (cd server && npx prisma studio)
```

### Testing
```bash
npm test                   # All tests (server + client)
npm run test:server        # Server tests only (Jest)
npm run test:client        # Client tests only (react-scripts test)
npm run test:integration   # Integration tests (--runInBand)
cd server && npx jest tests/services/AdEventService.circuitbreaker.test.js  # Single test file
cd server && npx jest --testNamePattern="pattern"                           # Single test by name
```

### Linting
```bash
npm run lint               # Both server + client
npm run lint:server        # ESLint on server/src/
npm run lint:client        # ESLint with --max-warnings=0
cd server && npm run lint:fix  # Auto-fix server
```

### Production
```bash
npm run build              # Build client for production
./start-production.sh      # Full production startup
```

## Architecture

### Monorepo Structure
- **`server/`** — Express + Socket.IO + tmi.js backend (Node.js, port 5000)
- **`client/`** — React 18 + MUI + React Router v6 frontend (port 3000, proxied to 5000)
- **`shared/`** — Workspace declared but not yet implemented
- Root uses npm workspaces

### Server Core (`server/src/`)

**Entry point:** `index.js` — Express app, Socket.IO setup, route registration, bot initialization.

**Services (the real business logic):**
- `services/ChannelManager.js` — Orchestrates per-channel state. Creates/manages QueueService instances, handles Socket.IO namespace lifecycle (`/channel/:channelId`), rebuilds cup standings.
- `services/QueueService.js` — Core engine (~90k). Queue state machine (PENDING → APPROVED → TOP_EIGHT → PLAYING → SCORED → PLAYED), voting/judging workflow, duplicate detection with penalty, VIP lane (bit-cheers), cup standings calculation using "shrunk top-K" algorithm.
- `services/AdEventService.js` — Twitch EventSub WebSocket per broadcaster for ad break detection. Includes circuit breaker for 429 rate limiting, ad schedule polling, pre-ad warnings via bot.
- `services/VideoService.js` — URL parsing and metadata fetching for YouTube/TikTok/Instagram. YouTube API integration with duration validation and 1-hour client-side cache.
- `services/RoleService.js` — RBAC with ChannelRoles (OWNER, MANAGER) and ShowRoles (PRODUCER, HOST, JUDGE, MODERATOR).
- `services/JudgeService.js` — Judge session management, token-based access.

**API:** `api/index.js` — All REST routes in one large file (~139k). Auth middleware, channel CRUD, queue management, cup/series endpoints, voting, judge scoring, role management.

**Auth:** Twitch OAuth via Passport.js (`auth/passport.js`), JWT sessions (`auth/middleware.js`), token-based judge access without OAuth (`auth/judgeToken.js`).

**Bot:** `bot/TwitchBot.js` — tmi.js IRC bot. Chat commands (!queue, !skip, !clear), URL auto-detection, per-user rate limiting, duplicate submission confirmation.

**Socket:** `socket/` — Socket.IO event handlers. Per-channel namespaces for real-time queue/voting/overlay state sync.

### Client Core (`client/src/`)

**Key pages:**
- `pages/Dashboard.js` — Producer control panel
- `pages/CupAdmin.js` — Cup/tournament management
- `pages/JudgePage.js` — Judge scoring interface (works with token auth, no Twitch login needed)
- `pages/PlayerOverlay.js`, `QueueOverlay.js`, `LeaderboardOverlay.js` — OBS browser source overlays
- `pages/ViewerHub.js` — Public viewer page

**State management:** React Context for auth (`contexts/AuthContext.js`) and Socket.IO (`contexts/SocketContext.js`).

### Database

Prisma ORM with PostgreSQL (production) or SQLite (local dev). Schema at `server/prisma/schema.prisma`.

Key models: Account, Channel, QueueItem, Cup, Series, JudgeScore, JudgeSession, CupStanding, ChannelRoleAssignment. All models use `@@map()` for snake_case table names while keeping camelCase in code.

### Key Patterns

- **Per-channel isolation:** Each channel gets its own QueueService instance, Socket.IO namespace, and Prisma queries scoped by channelId.
- **Voting lifecycle:** startVoting → judges submit scores → reveal-next (per judge) → reveal-average → reveal-social (weighted) → standings update.
- **Dual auth:** Twitch OAuth for regular users, JWT token URLs for judges (no Twitch account needed).
- **Real-time sync:** All state changes broadcast via Socket.IO namespace to connected dashboard/overlay/judge clients.

## Style & Conventions

- Server uses CommonJS (`require`/`module.exports`), `sourceType: "script"` in ESLint.
- Client uses ES modules (standard React/CRA).
- Prisma schema maps camelCase fields to snake_case columns via `@map()`.
- Unused variables prefixed with `_` are allowed (ESLint `argsIgnorePattern: "^_"`).
- Husky + lint-staged runs ESLint fix + Prettier on commit.
- Server tests live in `server/tests/` mirroring `src/` structure (e.g., `tests/services/`, `tests/auth/`, `tests/integration/`).
- Test setup in `server/tests/setup.js`.
