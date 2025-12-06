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
- **Commands**: `cd server && npm test -- --runInBand` runs the current suite fast (<1s).

## What to build next
- **Server integration (test DB)**: auth/user endpoint, channel create/delete/public queue, judge token/session/score/lock (manual vs forced, 5-decimal precision), admin route permission checks, health check. Add a reusable test DB helper/seed.
- **Client unit**: `PrecisionSlider` (precision, quick-set buttons), `JudgeSettings` state, nav/auth visibility, context hooks default values.
- **Client integration (MSW)**: `JudgePage` token auto-auth + submit/lock, `CupAdmin` judge link success/error, `ChannelQueue` renders queue items, dashboard empty state.
- **Smoke/e2e (Playwright)**: seeded judge URL flow (session start → submit score → lock), public queue render, admin debug page access control, landing page/nav works.
- **Seed fixtures**: a small seed script for the test DB (channel + cup + 3 videos + 1–2 judge tokens) callable from tests and Playwright.
- **Docs/commands**: add npm scripts for `test:integration` (server), `test:client`, `test:e2e` (Playwright) with clear env expectations.

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
