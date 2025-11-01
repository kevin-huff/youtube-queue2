# Streamer Gameshow Roadmap

## Vision
- Deliver a streamer-friendly, interactive gameshow where chat submits videos, judges score them live, and hosts orchestrate an entertaining reveal.
- Support nightly themed "cups" and multi-night "series" with persistent scoring, leaderboards, and user profiles.
- Provide production-ready overlays and tooling that integrate smoothly with OBS and multi-streamer participation.

## Success Criteria
- Stable multi-role experience (chat, moderator, host, judge, audience) with sub-second synchronization between video playback and scoring events.
- Scalable submission pipeline that prevents duplicate/low-effort content and streamlines moderator review.
- Engaging show flow with polished overlay animations, anonymized submissions, and dramatic scoring reveals.
- Persistent data that powers nightly cup leaderboards, series rankings, and player history pages.

## Roles & Personas
- **Chat Participants**: submit videos, view queue standings and results, get feedback on repeat attempts.
- **Moderators**: vet submissions, manage queue ordering, trigger warnings/penalties, oversee fairness.
- **Host**: single on-air lead who controls shuffle moments, starts playback, reveals scores, interacts with OBS overlay, and manages pacing.
- **Judges**: join a dedicated viewer, rate videos with high-precision slider, lock in their votes, coordinate with host.
- **Contestants** (submitters): accrue social scores, track stats, and compare performance nightly and across series.
- **Producers/Admins**: configure rules, scoring weights, manage judges/hosts, monitor health.

## Experience Flow Highlights
1. Chat submits video (links, metadata, optional trash talk). Immediate feedback on duplicates.
2. Moderators review submissions, thumbs up or thumbs down; flagged entries stay in queue with notes for the host, while hard TOS violations can be removed outright.
3. Host opens show, triggers shuffle animation/song; overlay displays cards rearranging into Top 8.
4. Judges and audience see synchronized queue updates on their viewers.
5. Host starts playback; judges receive anonymized entry (silly made up submitter name).
6. At video end, judges open slider (0.00000 – 5.00000 stars, 5-decimal precision) and lock votes—zero is a legitimate score for complete duds.
7. Host triggers reveal animation, showing judge scores, average, socialscore update, submitter identity.
8. Nightly leaderboard updates; series points assigned; queue advances to next entry.
9. Hosts can trigger multiple dramatic shuffles per show.
10. Future Twitch Bits integration to let chat juice the spectacle without affecting competitive integrity.
11. Gong show rules, each judge can gong, but all have to to stop current - no rating
12. VIP videos for bits, chat can gong for bits
13. VIP videos can't be gonged



## Feature Epics

### 1. Submission & Duplicate Management
- Videos submitted by dropping Twitch clip or YouTube link in chat (future-proofed for Instagram, TikTok, Vimeo, etc.).
- Auto-detect duplicates via canonical URL parsing, normalized video IDs, and historical scores.
- Warning message for submitters; impose 0 score if resubmission underperforms previous best (double-submit confirmation flow).
- Configurable cap on concurrent queue entries per chatter (default 2) with unlimited total nightly submissions, plus metadata capture (title, duration, submitter account).

### 2. Moderation Pipeline
- Moderator dashboard: pending queue, thumbs up or thumbs down, or delete.
- All submissions land in queue by default so hosts can review in-show.
- Thumbs-down keeps entry in queue with moderator note; host can skip any queued video at runtime.
- Mods can hard-remove anything that clearly violates platform or show rules.
- Bulk actions, search/filter (by user), audit trail of moderator decisions.
- Ability to annotate entries for host cues.
- Integration with chat to inform chat about status (accepted/rejected with reason).

### 3. Queue Orchestration & Shuffle Experience
- Core queue service with status states (pending, approved, top-eight, playing, scored, eliminated).
- Randomization logic for host-triggered shuffle that still supports Top 8 selection.
- Support multiple shuffles per night with varying animation scripts and soundtrack cues.
- Hooks for optional Twitch Bits-driven hype events without compromising fairness.
- OBS overlay assets: animated cards, soundtrack trigger hooks, host controls.
- Real-time sync to judge clients via sockets.
- Skipped or unplayed videos expire at end of the cup; only played entries persist to the database and contestant profiles.
- Stretch toys: chat-triggered gong to zero a video, VIP fast-pass bit redemption, meme-card overlays once the core flow is solid.
- Top 8 can be reshuffled on demand right up to playtime—no pre-show freeze.
- Trigger provided audio stingers when the gong slams or a fast-pass activates.
- Chat can spend bits to force bonus shuffles; host is free to shuffle again whenever the mood strikes—no cooldowns.
- Judges get a limited number of gong smashes each night; once they use them up, it is all vibes.

### 4. Playback & Sync Infrastructure
- Multi-viewer playback pipeline ensuring judges and host watch in sync.
- Judge link generator.
- Fallback handling for geo-blocked/private videos, timeouts, and manual skip.
- Pre-buffering and countdown triggers to align host, judges, and chat start times.
- Host control interface optimized for desktop browser (no mobile/tablet requirement).
- Maintain current near-real-time sync (target <250 ms differential) with instrumentation to alert on drift.
- Logging for drift detection and debugging.

### 5. Judging Interface
- Secure judge login with role-based access (AuthContext).
- Video player with submitter anonymized; optional picture-in-picture for host cam.
- Slider component with five-decimal precision and satisfying tactile feedback.
- "Hem and haw" interaction: allow tentative adjustments, confirm/lock vote state, show countdown if host forces lock. Judges can lock and unlock unless forced.
- Device compatibility for on-stream display (responsive layout, dark mode).
- Judges collaborate via external comms (e.g., Discord); in-app back-channel deferred.
- Vote reminders stay informal: host chases judges outside the app instead of automated nags.

### 6. Scoring Engine & Reveal
- Calculation pipeline: 0.00000–5.00000 judge slider scores, configurable judge weighting, and weighted socialscore (IMDB-style: blending global mean and video mean).
- Storage of raw judge ratings, audit logs, ability to recalc if judge disconnect.
- Host-facing reveal panel with step-by-step animation controls (individual judge reveals → aggregate → socialscore → ranking change).
- API endpoints for retrieving historical scores per video, submitter, cup, and series.

### 7. Leaderboards & Progression
- Nightly cup rankings: top performers, tie-break logic, highlight podium, everyone gets series points.
- Series leaderboard: cumulative points per placement (configurable weighting).
- Visualizations for on-stream overlay and web dashboards.
- History archive per cup, with filters by date, theme, or special events.
- Public leaderboard history doubles as the only producer analytics—no private dashboards needed.

### 8. User Profiles & History
- Unauthenticated portal for contestants with profile by Twitch username.
- Stats: submissions, acceptance rate, average judge score, socialscore trend, leaderboard placements.
- Video history with rewatch capability (respecting rights), comments/notes from judges or host.
- Notifications for upcoming cups, achievements, and penalties for duplicates.

### 9. Production & Overlay Toolkit
- OBS scene collection integration: video player, nightly leaderboard, series leaderboard, queue cards, shuffle animation, top 8 selected, score reveal.
- Control panel for producers to trigger overlays, set pre-licensed background music, toggle anonymization reveal.
- APIs/websockets for overlay clients to subscribe to state changes with minimal latency.
- Initial rollout excludes sponsor/integration widgets; design hooks for future brand modules.
- Visual refresh toward a cohesive, future-forward aesthetic (replace current Twitchy look) across overlays and control panels.
- Judge onboarding hub: share a login page where judges enter their name or Twitch auth, plus a menu of overlay URLs they can drop into OBS.
- Overlays carry the entire visual kit (no external asset packs); theme leans into immersive motion, 3D visuals, bold color palettes, and dark mode.
- Control panel fires the baked-in audio stingers for gong/fast-pass moments so the host just hits the button and vibes; overlays bundle the sound assets too.
- Documentation for hosts on running the show.

### 10. Platform & Operations
- Scalable backend (Node + Prisma) sized for live events; load testing for chat spikes.
- CI/CD, environment management, feature flagging for experiments.
- Monitoring (health-check, logging, error tracking), graceful recovery flows.
- Security: auth for judges/mods, rate-limiting, audit logging, signed links for judge viewers.
- Data retention: preserve raw judge votes and video history indefinitely; expose tooling for data export on request.

## Technical Considerations
- **Architecture**: Enhance real-time socket layer (server/src/socket) for multi-channel events (queue updates, judge prompts, overlay states).
- **Data Model**: Extend Prisma schema for cups, series, submissions, scores, judge sessions, penalties.
- **Media Handling**: Cache metadata via YouTube/Twitch APIs, enforce the existing duration cap, lean on mods/host for judgement calls.
- **Precision Scoring**: Store 5-decimal floats carefully (decimal or scaled integers) to avoid rounding issues.
- **Duplicate Detection**: Hash canonical video IDs, track per-user highest score, implement warning + penalty logic server-side.
- **Scalability**: Partition socket rooms by cup, ensure redis/pubsub if multiple server instances.
- **OBS Integration**: Build overlay client as lightweight web app served in browser source, powered by secure tokens.
- **Testing**: Focus on smoke tests around scoring, queue transitions, and duplicate enforcement; rehearsal beats formal QA.

## Phased Roadmap

### Phase 0 — Foundations (Week 0-2)
- ✅ Audit existing queue/player codebase, clean up technical debt, ensure reliable video playback.  
  _Queue service refactor + duplicate detection added in `server/src/services/QueueService.js`; socket/admin wiring reviewed._
- ✅ Implement role-based auth scaffolding (producer, judges, host, mod).  
  _Expanded Passport payload and middleware to expose per-channel show roles (`server/src/auth/passport.js`, `server/src/auth/middleware.js`)._
- ✅ Define Prisma schema updates and migrations for cups/series/scores.  
  _New cup/series/role models captured in `server/prisma/schema.prisma`; client regenerated._

### Phase 1 — Submission & Moderation MVP (Week 2-5)
- ✅ Build chat submissions plus duplicate warning flow.  
  _Queue service now blocks duplicates and returns prior score context; Twitch bot echoes warnings (`server/src/bot/TwitchBot.js`)._
- ✅ Deliver moderator dashboard with approve/deny/delete workflows.  
  _Admin page shows pending submissions with approve/reject actions via new `/submissions` API (`client/src/pages/AdminPage.js`, `server/src/api/index.js`)._
- ⚙️ Basic queue playback for host and judges (manual sync), minimal overlay updates.  
  _Socket plumbing remains from legacy build; overlay/judge UI still pending._

### Phase 2 — Judging & Scoring Core (Week 5-8)
- ✅ Create high-precision slider UI, judge session handling, vote locking.  
  _Judge page implemented with 5-decimal slider, session management, score submission (`client/src/pages/JudgePage.js`)._
- ✅ Implement scoring engine, anonymized playback, and host reveal UI.  
  _JudgeService handles session creation, score tracking, and aggregation (`server/src/services/JudgeService.js`)._
- ✅ Basic judge link generation and authentication.  
  _JWT-based judge tokens with 7-day expiration, secure token validation (`server/src/api/index.js`)._

### Phase 3 — Cup Management & Leaderboards (Week 8-10) **← CURRENT FOCUS**
- **Cup Lifecycle Management**
  - ✅ Create cups with title, slug, theme, status (LIVE/COMPLETED)
  - ✅ Update cup status (LIVE → COMPLETED)
  - ✅ Set active cup (only one LIVE cup at a time for auto-assignment)
  - ✅ Delete cups (remove old/test cups)
  _Cup admin panel now exposes full CRUD plus status toggles (`client/src/pages/CupAdmin.js`, `/api/channels/:id/cups/*`)._
  
- **Judge Management**
  - ✅ Generate judge links (creates JWT token, this IS the assignment)
  - ✅ List all judges for a cup with their links
  - ✅ Revoke/regenerate judge tokens for security
  - ✅ Judge can update their display name
  _All powered by JudgeService token/session APIs; panel surfaces revoke/regenerate + name edits._
  
- **Auto Video Assignment**
  - ✅ When cup is LIVE, videos added to queue automatically get `cup_id` set
  - ✅ Videos retain all metadata (submitter, timestamp, platform, etc.)
  _QueueService auto-attaches active cup and Prisma schema now records `cup_id`. Baseline migrations applied to prod db._
  
- **User Leaderboard (Social Score Rankings)**
  - ✅ Aggregate scores by submitter username (not by video)
  - ✅ Calculate social score per user (sum/average of their video scores)
  - ✅ Real-time leaderboard updates as videos are scored
  - ⚙️ User wins cups, not individual videos
  _ChannelManager rebuilds cup standings and sockets broadcast live updates; CupAdmin shows standings + per-video breakdown. Need explicit cup winner ceremony UX._
  
- **Scoring Flow**
  - ✅ All judges score one video at a time via slider
  - ⚙️ Host sees all individual judge scores in real-time
  - ✅ Host submits calculated average score
  - ⚙️ Score reveal (show all scores at once) - future enhancement
  _New finalize endpoint locks scores, rebuilds standings, and emits socket events. Host view still needs inline real-time surface._
  
- **Historical Results**
  - ⚙️ Cup archive page showing past cups
  - ⚙️ Final user rankings from completed cups
  - ⚙️ Video history per cup with scores and metadata
  - ⚙️ No CSV export needed, just web view

### Phase 4 — Queue Orchestration & Shuffle (Week 10-13)
- Persist nightly cup results and rudimentary leaderboard display.

### Phase 3 — Showmanship & Overlays (Week 8-11)
- ⚙️ Develop shuffle animation, reveal sequences, OBS overlay client.
  _New OBS-ready queue overlay (`/overlay/:channelName/queue`) renders live Top 8 cards with seeded shuffle animation and queue preview; score reveal animation still pending._
- ⚙️ Synchronize audience viewer with judge feed; polish host control panel experience.
  _Channel queue console now surfaces Top 8 state and provides a one-click shuffle trigger for producers/hosts; next up is wiring the same controls into dedicated host dashboard._
- Integrate audio cues, countdowns, and stage transitions.

### Phase 4 — Progression & Profiles (Week 11-14)
- Launch series-wide leaderboard with socialscore weighting.
- Build contestant profile pages with history and stats.
- Add duplicate penalty scoring logic tied into results and notifications.

### Phase 5 — Polish & Operations (Week 14+)
- Load/stress testing, logging/monitoring integration, failover rehearsals.
- UX refinements, accessibility pass, localization hooks.
- Documentation for production workflows, runbooks for moderators and hosts.

## Workstreams & Backlog Seeds
- **Backend**: Submission APIs, scoring engine, Prisma migrations, real-time queue events, duplicate enforcement.
- **Frontend (Client App)**: Queue page redesign, judge dashboard, host control panel, contestant profiles.
- **Overlay/OBS**: Web overlay client, animation assets, control integrations, audio cue system.
- **DevOps**: Environment automation, CI updates, metrics dashboard, load testing harness.
- **Product/UX**: Interaction design for shuffle/reveal, slider feedback, moderator ergonomics, show pacing, and delivery of the future-forward visual theme.
- **Data & Analytics**: Lightweight telemetry for queue counts and played counts, with optional deep dives into judge variability and viewer retention.

## Risks & Mitigations
- **Playback Drift**: Invest in sync protocol (timestamp heartbeats, resync hooks) and manual override controls.
- **Judge Disconnects**: Auto-pause, reassign judges, allow host override, keep votes cached client-side.
- **Duplicate Abuse**: Robust normalization, historical score caching, moderator escalation path.
- **Scoring Disputes**: Maintain audit trails, allow post-show adjustments with transparency.
- **Operational Complexity**: Build rehearsable scripts, provide fallback manual controls, have redundancy for overlays/audio.

## Open Questions
- None for now—ship the plan and see what ideas pop up during rehearsals.

## Next Steps
- Wire Cup standings + finalize flow into host-facing UI (Queue/Judge dashboards) for real-time oversight.
- Build cup archive & historical results views across client (public + admin) using new standings APIs.
- Design winner declaration + cup wrap-up UX (auto-identify top submitter once scores finalize).
- Finish audience/overlay sync spike and align socket events with production OBS overlay needs.
- Schedule rehearsal milestone with dummy cup data to battle-test scoring + standings loop end-to-end.
