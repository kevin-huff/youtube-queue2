/**
 * Integration tests for judge API flows with real Prisma + judge token middleware.
 * Requires TEST_DATABASE_URL (or DATABASE_URL) to point to a migrated Postgres DB.
 */
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const request = require('supertest');
const JudgeService = require('../../src/services/JudgeService');
const { generateJudgeToken } = require('../../src/auth/judgeToken');
const { initializeDatabase, closeDatabase } = require('../../src/database/connection');
const { createPrismaClient, resetDatabase, seedBasicCup, ensureTestSchema } = require('./helpers/db');
const { buildTestApp } = require('./helpers/app');

const hasDb = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('Judge API (token auth + scoring)', () => {
  let prisma;
  let seed;
  let judgeService;
  let app;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
    prisma = createPrismaClient();
    await prisma.$connect();
    await ensureTestSchema(prisma);
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    seed = await seedBasicCup(prisma);
    judgeService = new JudgeService({ emit: jest.fn() }, seed.channel.id);
    judgeService.db = prisma;

    app = buildTestApp({
      prisma,
      judgeServices: { [seed.channel.id]: judgeService }
    }).app;
  });

  const appForUser = (user) =>
    buildTestApp({
      prisma,
      user,
      judgeServices: { [seed.channel.id]: judgeService }
    }).app;

  test('start session, submit score, lock via judge token', async () => {
    // Start session
    const startRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });

    expect(startRes.status).toBe(200);

    const itemId = seed.queueItems[0].id;

    const scoreRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${itemId}/score`)
      .query({ token: seed.judgeToken })
      .send({ score: 4.25, comment: 'Nice' });

    expect(scoreRes.status).toBe(200);
    expect(Number(scoreRes.body.judgeScore.score)).toBeCloseTo(4.25);

    const lockRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${itemId}/lock`)
      .query({ token: seed.judgeToken });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.judgeScore.isLocked).toBe(true);
  });

  test('host force-locks votes', async () => {
    // Pre-submit a score
    await judgeService.createSession(seed.cup.id, seed.judgeId, 'Judge One');
    await judgeService.submitScore(seed.cup.id, seed.queueItems[0].id, seed.judgeId, 4.0, null, 'Judge One');

    const hostAccount = await prisma.account.create({
      data: { id: 'acct-host', username: 'host', displayName: 'Host' }
    });
    await prisma.channelOwner.create({
      data: { accountId: hostAccount.id, channelId: seed.channel.id, role: 'OWNER' }
    });

    const user = {
      id: hostAccount.id,
      username: hostAccount.username,
      displayName: hostAccount.displayName,
      channels: [{ id: seed.channel.id, roles: ['HOST'], ownershipRole: 'OWNER' }]
    };

    const hostApp = buildTestApp({
      prisma,
      user,
      judgeServices: { [seed.channel.id]: judgeService }
    }).app;

    const forceRes = await request(hostApp)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/force-lock`);

    expect(forceRes.status).toBe(200);
    expect(forceRes.body.result.count).toBe(1);
  });

  test('non-host cannot force-lock votes', async () => {
    const user = {
      id: 'acct-rando',
      username: 'rando',
      displayName: 'Rando',
      channels: [] // no roles on channel
    };

    const nonHostApp = appForUser(user);

    const forceRes = await request(nonHostApp)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/force-lock`);

    expect(forceRes.status).toBe(403);
  });

  test('force-lock with no votes returns count 0', async () => {
    const ownerUser = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const ownerApp = appForUser(ownerUser);

    const forceRes = await request(ownerApp)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/force-lock`);

    expect(forceRes.status).toBe(200);
    expect(forceRes.body.result.count).toBe(0);
  });

  test('rejects missing or invalid judge token', async () => {
    const startRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`);

    expect(startRes.status).toBe(401);

    const scoreRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/score`)
      .query({ token: 'not-a-real-token' })
      .send({ score: 3.5 });

    expect(scoreRes.status).toBe(401);
  });

  test('update judge name and end session', async () => {
    const itemId = seed.queueItems[0].id;

    const startRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });
    expect(startRes.status).toBe(200);

    const renameRes = await request(app)
      .patch(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/name`)
      .query({ token: seed.judgeToken })
      .send({ judgeName: 'Renamed Judge' });

    expect(renameRes.status).toBe(200);
    expect(renameRes.body.session.judgeName).toBe('Renamed Judge');

    const endRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/end`)
      .query({ token: seed.judgeToken });

    expect(endRes.status).toBe(200);
    expect(endRes.body.session.status).toBe('ENDED');

    // Ensure score submit now fails for ended session
    const scoreRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${itemId}/score`)
      .query({ token: seed.judgeToken })
      .send({ score: 4.5 });
    expect(scoreRes.status).toBe(401);
  });

  test('regenerate judge token returns url and token', async () => {
    const ownerUser = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const ownerApp = appForUser(ownerUser);

    const res = await request(ownerApp)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judges/${seed.judgeId}/regenerate`)
      .send({ judgeName: 'New Judge' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.url).toContain(`/judge/${seed.channel.id}/${seed.cup.id}`);
    expect(res.body.session).toBeDefined();
  });

  test('revoke and prune judge sessions', async () => {
    // Start session to have something to revoke
    await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });

    const ownerUser = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const ownerApp = appForUser(ownerUser);

    const revokeRes = await request(ownerApp)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judges/${seed.judgeId}/revoke`);
    expect(revokeRes.status).toBe(200);

    // mark a session as ENDED for prune
    await prisma.judgeSession.updateMany({
      where: { cupId: seed.cup.id },
      data: { status: 'ENDED' }
    });

    const pruneRes = await request(ownerApp)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judges/prune`)
      .send({ olderThanMinutes: 0 });

    expect(pruneRes.status).toBe(200);
    expect(typeof pruneRes.body.deleted).toBe('number');
  });

  test('score submission without starting session is rejected', async () => {
    const res = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/score`)
      .query({ token: seed.judgeToken })
      .send({ score: 4.2 });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/session not active/i);
  });

  test('rejects token for a different cup', async () => {
    const otherCup = await prisma.cup.create({
      data: { channelId: seed.channel.id, title: 'Other', slug: 'other', status: 'LIVE', isActive: true }
    });

    const res = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${otherCup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/grant access to this cup/i);
  });

  test('double-start returns same session (upsert)', async () => {
    const first = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });

    expect(second.status).toBe(200);
    expect(second.body.session.id).toBe(first.body.session.id);

    const count = await prisma.judgeSession.count({ where: { cupId: seed.cup.id } });
    expect(count).toBe(1);
  });

  test('score validation fails for out-of-range value', async () => {
    const res = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/score`)
      .query({ token: seed.judgeToken })
      .send({ score: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ msg: expect.stringMatching(/between 0 and 5/i) })])
    );
  });

  test('expired judge token is rejected', async () => {
    const expiredToken = generateJudgeToken({
      channelId: seed.channel.id,
      cupId: seed.cup.id,
      judgeName: 'Expired',
      expiresIn: '-1s'
    });

    const res = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  test('cannot unlock a forced lock via judge token', async () => {
    await judgeService.createSession(seed.cup.id, seed.judgeId, 'Judge One');
    await judgeService.submitScore(seed.cup.id, seed.queueItems[0].id, seed.judgeId, 3.5, null, 'Judge One');
    await judgeService.forceLockAllVotes(seed.cup.id, seed.queueItems[0].id);

    const res = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/unlock`)
      .query({ token: seed.judgeToken });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/cannot unlock a forced lock/i);
  });

  test('rejects judge token used on a different channel', async () => {
    await prisma.channel.create({
      data: { id: 'otherchan', displayName: 'Other', isActive: true, settings: {} }
    });

    const res = await request(app)
      .post(`/api/channels/otherchan/cups/${seed.cup.id}/judge/session/start`)
      .query({ token: seed.judgeToken });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/grant access to this channel/i);
  });

  test('lock and unlock endpoints are idempotent', async () => {
    await judgeService.createSession(seed.cup.id, seed.judgeId, 'Judge One');
    await judgeService.submitScore(seed.cup.id, seed.queueItems[0].id, seed.judgeId, 2.5, null, 'Judge One');

    const lock1 = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/lock`)
      .query({ token: seed.judgeToken });
    expect(lock1.status).toBe(200);
    expect(lock1.body.judgeScore.isLocked).toBe(true);

    const lock2 = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/lock`)
      .query({ token: seed.judgeToken });
    expect(lock2.status).toBe(200);
    expect(lock2.body.judgeScore.isLocked).toBe(true);

    const unlock1 = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/unlock`)
      .query({ token: seed.judgeToken });
    expect(unlock1.status).toBe(200);
    expect(unlock1.body.judgeScore.isLocked).toBe(false);

    const unlock2 = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups/${seed.cup.id}/items/${seed.queueItems[0].id}/unlock`)
      .query({ token: seed.judgeToken });
    expect(unlock2.status).toBe(200);
    expect(unlock2.body.judgeScore.isLocked).toBe(false);
  });
});
