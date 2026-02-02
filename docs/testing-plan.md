# Testing Plan

This document describes the testing strategy for the project, what to build right now, and what future contributors should do when adding new work.

## Goals
- Give fast feedback locally (unit + component tests).
- Prove key flows end-to-end with seeded data (smoke/regression).
- Keep CI reliable and deterministic (isolated test DB, hermetic API mocks on the client).

## Tooling (existing and planned)
- Server: Jest + Supertest, Prisma test database (Postgres), manual mocks for bot/socket/Twitch.
- Client: React Testing Library + Jest DOM, MSW for API mocking.
- E2E/Smoke: Playwright hitting a running app seeded with test data.
- Lint: eslint/prettier already wired; run before tests in CI.

## Environments
- Use a dedicated test database URL: `DATABASE_URL=postgresql://.../youtube_queue_test`.
- Run `npx prisma migrate deploy` (or `db push` for local dev) against the test DB before integration/e2e.
- Store test-only uploads/logs in temp directories; do not reuse production paths.

## What’s already in place
- **Server unit**: Jest setup file that silences logger and sets test env; coverage for judge token helpers/middleware, auth role/ownership guards, TokenStore, public channel routes (with stubbed channel manager), and JudgeService submit/lock/unlock/force-lock/average behaviors with mocked Prisma/queue events.
- **Server integration harness + cases**: Prisma helper to reset/seed a test DB (`tests/integration/helpers/db.js`), app helper to mount the real API with stubbed auth (`tests/integration/helpers/app.js`). DB-backed tests for JudgeService flows; judge API (token submit/lock/force-lock; rename/end; invalid/expired token; wrong cup/channel 403; idempotent lock/unlock; require active session before scoring); admin permission checks (admin debug reject non-admin/manager); channel lifecycle (multi-owner delete; non-owner/producer delete forbidden; inactive delete is a no-op 200); queue moderation review actions (approve; VIP add/remove); ads/next happy path; public queue including inactive-channel 404; and health endpoint. Uses `TEST_DATABASE_URL`/`DATABASE_URL`; validated against local Docker Postgres (`postgresql://yqueue:yqueue@localhost:5433/youtube_queue_test`). Script: `cd server && npm run test:integration`.
- **Client unit/integration**: RTL + Jest DOM for `PrecisionSlider`; `JudgeSettings` dialog interactions; `App` protected-route redirect; `JudgePage` token auto-start + lock-in; `ChannelQueue` public queue render; `CupAdmin` judge link flow (mocked auth/socket/api).
- **Commands**: `cd server && npm test -- --runInBand` runs the unit suite fast (<1s); `cd server && npm run test:integration` for DB-backed tests; `cd client && npm test -- --watch=false --runInBand` for client tests.

## What to build next
- **Server integration (test DB)**:
  - Queue moderation edges: review reject/warn/top-eight; VIP list GET for owners.
  - Health endpoint when DB unavailable (simulate prisma failure) returns 500 with error.
- **Server services (unit/integration)**: JudgeService average with multiple scores/locks, unlockAllForcedVotes idempotent, createSession trims judgeName, endSession twice safe; TokenStore expiration trimming under load.
- **Client unit**: AuthContext error handling for `/api/auth/user` failure; protected route redirect loop prevention; post-login redirect preserves query string; `PrecisionSlider` clamp already covered, add disabled state behavior.
- **Client integration (MSW)**: CupAdmin create-cup error banner; prune judges success; ChannelQueue producer controls disabled when not connected; filter empty state; JudgePage expired token shows error; dashboard empty state.
- **Smoke/e2e (Playwright)**: seeded judge URL flow (session start → score → lock); public queue render; admin debug access control; login redirect + dashboard render; CupAdmin judge link generation.
- **Seed fixtures**: minimal seed script (channel + cup + 3 videos + 1–2 judge tokens) reused by integration and Playwright.
- **Docs/commands**: add npm scripts for `test:client`, `test:e2e` (Playwright) with env expectations; note need to `prisma db push --force-reset` for test DB before integration.

## How to run (intended commands)
- Fast loop: `npm run test:server -- --runInBand` for server unit/integration, `npm run test:client -- --watch=false` for client.
- Integration only: `npm run test:integration` (runs against test DB after migrate/seed).
- E2E/smoke: start app against test DB, seed, then `npm run test:e2e`.
- CI order: install deps → lint → server tests → client tests → optional Playwright smoke (can be gated to main/nightly).

## Future contributor guidelines
- Every new feature or bugfix should ship with:
  - Unit tests for pure logic.
  - Integration tests when touching API contracts, DB shape, or auth/permissions.
  - Client RTL/MSW tests when adding pages/components that depend on API data.
- Update seeds/fixtures if your change needs new data. Keep seeds minimal and deterministic.
- Prefer MSW for client tests instead of hitting real APIs. Keep Playwright flows short and stable.
- Keep test names behavior-focused (describe the user-visible outcome, not implementation).
- Use temporary dirs for any filesystem writes in tests; never touch production paths.
- If you add a new external integration, provide contract tests and a mock.
- Before opening a PR: `npm run lint` and `npm test` at repo root; run `npm run test:integration` if you touched DB/API; run Playwright smoke if you changed end-to-end flows.

## Open questions to resolve when implementing
- Finalize whether integration uses `db push` or full `migrate deploy` in CI.
- Decide which Playwright flows run on every push vs. nightly (suggest: 1–2 minute smoke on main only).
- Confirm minimal seed shape for tests vs. the existing `test-phase2-setup.js` script.
