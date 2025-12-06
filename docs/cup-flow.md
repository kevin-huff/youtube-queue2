# Cup Flow Reference

This document walks through every phase of a cup – from creation to scoring and archival – and calls out where each operation lives in the codebase. Use it as a map when debugging the producer tools, extending CupAdmin, or wiring new automations into the show flow.

## Core Entities & Statuses

- **Cup** (`server/prisma/schema.prisma:181`): owns metadata (title, slug, optional theme), schedule, `status` (`DRAFT → SCHEDULED → LIVE → COMPLETED/CANCELLED`), `isActive`, and optional `seriesId` links.
- **CupStanding** (`server/prisma/schema.prisma:300`): denormalized leaderboard rows per submitter with `averageScore` (social value), `totalScore`, `judgeCount`, and `rank`. Rebuilt after major scoring milestones.
- **QueueItem**: submissions reference a `cupId` once routed into the current competition. Standard queue statuses (`QueueStatus` enum) still determine playback.
- **JudgeSession / JudgeScore**: ephemeral sockets + persisted votes; managed by `JudgeService` routes (`server/src/api/index.js:2401-2790`).

## Flow Overview

### 1. Configure & Activate a Cup

1. **Create** via `POST /api/channels/:channelId/cups` (`server/src/api/index.js:1208`). Producers specify title/slug, optional theme/series, and initial `status` (default `DRAFT`).
2. **Edit** metadata or toggle status with `PATCH /api/channels/:channelId/cups/:cupId` (`server/src/api/index.js:1638`). Date fields accept ISO strings and are normalised server-side.
3. **Mark active** using `PATCH /api/channels/:channelId/cups/:cupId/set-active` (`server/src/api/index.js:1424`). This clears `isActive` on other cups in the channel and flags the chosen cup. The Producer dashboard auto-selects the active cup (`client/src/pages/CupAdmin.js:73-125`).
4. **Series alignment** is optional; CupAdmin exposes CRUD for `/series` endpoints so nightly cups can roll up into a longer arc (`server/src/api/index.js:1243-1595`).

### 2. Route Submissions Into the Cup

1. **Assign queue items** explicitly through `POST /api/channels/:channelId/cups/:cupId/assign-item` (`server/src/api/index.js:1678`). CupAdmin also lists the first 20 queued videos for quick auditing (`server/src/api/index.js:1509`).
2. **Unassign/move** videos with `PATCH /api/channels/:channelId/cups/:cupId/videos/:videoId/unassign` (`server/src/api/index.js:1509-1539`).
3. **Filtering**: Queue fetches can request `activeCupsOnly`, which discards items tied to non-LIVE cups (`server/src/services/QueueService.js:2271-2331`).
4. **Top Eight + playback**: once a cup is active, the Producer console embeds `ChannelQueue`, so shuffle/draw controls operate on just that cup’s queue context (`client/src/pages/Dashboard.js:2461`).

### 3. Onboard Judges

1. **Generate tokens** per cup with `POST /api/channels/:channelId/cups/:cupId/judge-link` (`server/src/api/index.js:1540`). Tokens encode `channelId`, `cupId`, judge alias, and TTL; CupAdmin surfaces the ready-to-share URL.
2. **Sessions** begin when a judge visits their tokenised link and calls `POST /judge/session/start` (`server/src/api/index.js:2401`). JudgeService stores session state and the queue instance seeds judges from active sessions in `QueueService.startVoting` (`server/src/services/QueueService.js:532-611`).
3. **Management tools** exist for producers: list sessions (`GET .../judges`, `server/src/api/index.js:2428`), revoke/regenerate tokens (`server/src/api/index.js:2454-2495`), prune inactive judges (`server/src/api/index.js:2516-2539`), and rename judges mid-show (`server/src/api/index.js:2566`).

### 4. Live Voting Lifecycle

1. **Kick off voting** with `POST /voting/start` (`server/src/api/index.js:3430`). `QueueService.startVoting` snapshots the queue item, preloads judge sessions + existing scores, calculates the cup’s social baseline, and enters the `COLLECTING` stage (`server/src/services/QueueService.js:532-704`).
2. **Judges score + lock** via token-authenticated routes (`server/src/api/index.js:2595-2680`). QueueService keeps per-judge status and re-computes totals each time `_ensureJudgeEntry` or `_recalculateVotingAggregates` runs (`server/src/services/QueueService.js:367-530`).
3. **Reveal order**: producers advance judge reveals with `POST /voting/reveal-next` to transition from anonymous locks to on-air scores. Once all judges are revealed, `POST /voting/reveal-average` exposes the computed average and enforces duplicate-protection (zeroing ties that fail to beat prior runs) (`server/src/services/QueueService.js:821-858`).
4. **Social score** becomes available after the average reveal; `QueueService` weights the live average with the per-cup baseline and a minimum-vote prior (`DEFAULT_SOCIAL_MIN_VOTES = 3`, `DEFAULT_SOCIAL_GLOBAL_MEAN = 3.4`) so sparse judging can’t skew leaderboards (`server/src/services/QueueService.js:498-530`). Producers call `POST /voting/reveal-social` to publish it (`server/src/api/index.js:3536` / `server/src/services/QueueService.js:862-907`).
5. **Completion**: `POST /voting/complete` closes the session, ensures reveals are stamped, and emits history for archives/on-screen widgets (`server/src/services/QueueService.js:1040-1098`).

### 5. Standings & Broadcast Surfaces

1. When social is revealed, QueueService pushes a `cup:standings_preview` socket event so overlays refresh immediately (`server/src/services/QueueService.js:894-930`). Clients such as `ChannelQueue` and the leaderboard overlay display `standing.averageScore` as the “social” number (`client/src/pages/ChannelQueue.js:2585-2615`, `client/src/pages/LeaderboardOverlay.js:358-600`).
2. Producers can regenerate authoritative standings (and per-video breakdowns) anytime via `GET /api/channels/:channelId/cups/:cupId/standings` (`server/src/api/index.js:3819`). Under the hood, `ChannelManager.rebuildCupStandings` walks all scored/played items, applies duplicate penalties, and computes the padded top-K average for each submitter (`server/src/services/ChannelManager.js:294-365`).
3. Standings persist in `cup_standings` rows, which power public endpoints (`router.get('/channels/public/:channelName/cups/:cupId/standings')`, `server/src/api/index.js:902-939`) and the viewer hub.

### 6. Closing Out a Cup

1. **Finalize queue items**: after the last entry is judged, producers can mark the cup `COMPLETED` with the regular patch route (`server/src/api/index.js:1638`). CupAdmin buttons enforce `LIVE → COMPLETED` transitions and hide host controls once archived (`client/src/pages/CupAdmin.js:1281-1352`).
2. **Rebuild standings** one final time to freeze totals and rankings; CupAdmin’s “Refresh Standings” button calls `channelManager.rebuildCupStandings` through `/cups/:cupId/standings` (`client/src/pages/CupAdmin.js:1409-1490`).
3. **Series rollup**: if the cup belongs to an active series, downstream jobs can update `series_standings` to allocate season points (see schema at `server/prisma/schema.prisma:320`).
4. **Archival**: completed cups remain queryable via the public `/channels/public/:channelName/cups` endpoints for viewers and VOD tooling (`server/src/api/index.js:802-904`).

## Quick Reference

| Phase | Primary API(s) | Key Services |
| --- | --- | --- |
| Configure | `POST/PATCH /cups`, `/cups/:id/set-active` | Prisma cup model, CupAdmin |
| Intake | `POST /cups/:id/assign-item`, `PATCH /videos/:videoId/unassign` | QueueService `_withCupInclude` |
| Judges | `POST /judge-link`, `/judge/session/*`, `/judges/*` | JudgeService, token auth |
| Voting | `/voting/*`, `/items/:itemId/(score|lock)` | QueueService voting stages |
| Standings | `/cups/:id/standings`, socket `cup:standings_preview` | ChannelManager.rebuildCupStandings |
| Close-out | `PATCH /cups/:id` (status), optional series updates | CupStanding persistence |

Use this flow to reason about where data lives at each step and which module to patch when adding a new producer UX or automation to the nightly cups.

