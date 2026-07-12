/**
 * API integration tests that hit the real router with a Postgres-backed Prisma client.
 * Skips automatically when TEST_DATABASE_URL (or DATABASE_URL) is not set.
 */
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const request = require('supertest');
const { initializeDatabase, closeDatabase } = require('../../src/database/connection');
const QueueService = require('../../src/services/QueueService');
const { createPrismaClient, resetDatabase, seedBasicCup, ensureTestSchema } = require('./helpers/db');
const { buildTestApp } = require('./helpers/app');

const hasDb = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('API integration (DB)', () => {
  let prisma;

  beforeAll(async () => {
    // Force the shared Prisma client to use the test database
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
  });

  test('auth/user returns authenticated user when logged in', async () => {
    const account = await prisma.account.create({
      data: { id: 'acct-auth', username: 'authuser', displayName: 'Auth User' }
    });

    const user = { id: account.id, username: account.username, displayName: account.displayName, channels: [] };
    const { app } = buildTestApp({ prisma, user });

    const res = await request(app).get('/api/auth/user');

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.id).toBe(account.id);
  });

  test('channel create and delete with ownership', async () => {
    const account = await prisma.account.create({
      data: { id: 'acct-owner', username: 'owner', displayName: 'Owner' }
    });

    const user = { id: account.id, username: account.username, displayName: account.displayName, channels: [] };
    const { app } = buildTestApp({ prisma, user });

    const createRes = await request(app)
      .post('/api/channels')
      .send({ name: 'mychannel' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.channel.id).toBe('mychannel');

    const ownerRow = await prisma.channelOwner.findUnique({
      where: { accountId_channelId: { accountId: account.id, channelId: 'mychannel' } }
    });
    expect(ownerRow).toBeTruthy();

    const deleteRes = await request(app).delete('/api/channels/mychannel');
    expect(deleteRes.status).toBe(200);
    const channel = await prisma.channel.findUnique({ where: { id: 'mychannel' } });
    expect(channel.isActive).toBe(false);
  });

  test('channel delete keeps channel active when other owners remain', async () => {
    const ownerA = await prisma.account.create({
      data: { id: 'acct-a', username: 'ownera', displayName: 'Owner A' }
    });
    const ownerB = await prisma.account.create({
      data: { id: 'acct-b', username: 'ownerb', displayName: 'Owner B' }
    });
    await prisma.channel.create({
      data: { id: 'mychan', displayName: 'mychan', isActive: true, settings: {} }
    });
    await prisma.channelOwner.createMany({
      data: [
        { accountId: ownerA.id, channelId: 'mychan', role: 'OWNER' },
        { accountId: ownerB.id, channelId: 'mychan', role: 'OWNER' }
      ]
    });

    const user = { id: ownerA.id, username: ownerA.username, displayName: ownerA.displayName, channels: [{ id: 'mychan', roles: [], ownershipRole: 'OWNER' }] };
    const { app } = buildTestApp({ prisma, user });

    const deleteRes = await request(app).delete('/api/channels/mychan');
    expect(deleteRes.status).toBe(200);

    const channel = await prisma.channel.findUnique({ where: { id: 'mychan' } });
    expect(channel.isActive).toBe(true); // still has another owner

    const remainingOwners = await prisma.channelOwner.count({ where: { channelId: 'mychan' } });
    expect(remainingOwners).toBe(1);
  });

  test('channel delete is forbidden for managers (non-owner)', async () => {
    const owner = await prisma.account.create({
      data: { id: 'acct-owner-mgr', username: 'ownermgr', displayName: 'OwnerMgr' }
    });
    const manager = await prisma.account.create({
      data: { id: 'acct-manager', username: 'manager', displayName: 'Manager' }
    });
    await prisma.channel.create({
      data: { id: 'managedchan', displayName: 'managedchan', isActive: true, settings: {} }
    });
    await prisma.channelOwner.create({
      data: { accountId: owner.id, channelId: 'managedchan', role: 'OWNER' }
    });
    await prisma.channelRoleAssignment.create({
      data: { accountId: manager.id, channelId: 'managedchan', role: 'PRODUCER' }
    });

    const user = {
      id: manager.id,
      username: manager.username,
      displayName: manager.displayName,
      channels: [{ id: 'managedchan', roles: ['PRODUCER'], ownershipRole: null }]
    };
    const { app } = buildTestApp({ prisma, user });

    const res = await request(app).delete('/api/channels/managedchan');
    expect(res.status).toBe(403);

    const channel = await prisma.channel.findUnique({ where: { id: 'managedchan' } });
    expect(channel.isActive).toBe(true);
  });

  test('channel delete is forbidden for non-owners', async () => {
    const owner = await prisma.account.create({
      data: { id: 'acct-owner', username: 'owner', displayName: 'Owner' }
    });
    const nonOwner = await prisma.account.create({
      data: { id: 'acct-user', username: 'user', displayName: 'User' }
    });
    await prisma.channel.create({
      data: { id: 'mychan2', displayName: 'mychan2', isActive: true, settings: {} }
    });
    await prisma.channelOwner.create({
      data: { accountId: owner.id, channelId: 'mychan2', role: 'OWNER' }
    });

    const user = { id: nonOwner.id, username: nonOwner.username, displayName: nonOwner.displayName, channels: [] };
    const { app } = buildTestApp({ prisma, user });

    const res = await request(app).delete('/api/channels/mychan2');
    expect(res.status).toBe(403);

    const channel = await prisma.channel.findUnique({ where: { id: 'mychan2' } });
    expect(channel.isActive).toBe(true);
  });

  test('deleting an inactive channel still returns success', async () => {
    const owner = await prisma.account.create({
      data: { id: 'acct-owner-inactive', username: 'ownerinactive', displayName: 'OwnerInactive' }
    });
    await prisma.channel.create({
      data: { id: 'inactivechan', displayName: 'inactivechan', isActive: false, settings: {} }
    });
    await prisma.channelOwner.create({
      data: { accountId: owner.id, channelId: 'inactivechan', role: 'OWNER' }
    });

    const user = { id: owner.id, username: owner.username, displayName: owner.displayName, channels: [{ id: 'inactivechan', roles: [], ownershipRole: 'OWNER' }] };
    const { app } = buildTestApp({ prisma, user });

    const res = await request(app).delete('/api/channels/inactivechan');
    expect(res.status).toBe(200);

    const channel = await prisma.channel.findUnique({ where: { id: 'inactivechan' } });
    expect(channel.isActive).toBe(false);
  });

  test('review approve updates queue item moderation status', async () => {
    const seed = await seedBasicCup(prisma, { accountId: 'acct-review', accountUsername: 'ownerreview' });
    const queueService = new QueueService({ emit: jest.fn() }, seed.channel.id);
    queueService.db = prisma;

    const user = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const { app } = buildTestApp({ prisma, user, queueService, queueChannelId: seed.channel.id });

    const res = await request(app)
      .post(`/api/channels/${seed.channel.id}/submissions/${seed.queueItems[0].id}/review`)
      .send({ action: 'APPROVE', note: 'looks good', position: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.item.status).toBe('APPROVED');
    expect(res.body.item.moderationStatus).toBe('APPROVED');
    expect(res.body.item.moderatedByDisplayName).toBe(user.displayName);
  });

  test('duplicate cup slugs are auto-suffixed instead of failing', async () => {
    const seed = await seedBasicCup(prisma, { accountId: 'acct-slug', accountUsername: 'ownerslug' });
    const user = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const { app } = buildTestApp({ prisma, user, queueChannelId: seed.channel.id });

    const first = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups`)
      .send({ title: 'Friday Cup', slug: 'friday-cup' });
    expect(first.status).toBe(201);
    expect(first.body.cup.slug).toBe('friday-cup');

    const second = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups`)
      .send({ title: 'Friday Cup', slug: 'friday-cup' });
    expect(second.status).toBe(201);
    expect(second.body.cup.slug).toBe('friday-cup-2');

    const third = await request(app)
      .post(`/api/channels/${seed.channel.id}/cups`)
      .send({ title: 'Friday Cup', slug: 'friday-cup' });
    expect(third.status).toBe(201);
    expect(third.body.cup.slug).toBe('friday-cup-3');
  });

  test('VIP review action adds and removes VIP entry', async () => {
    const seed = await seedBasicCup(prisma, { accountId: 'acct-vip', accountUsername: 'ownervip' });
    const queueService = new QueueService({ emit: jest.fn() }, seed.channel.id);
    queueService.db = prisma;

    const user = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const { app } = buildTestApp({ prisma, user, queueService, queueChannelId: seed.channel.id });

    const vipRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/submissions/${seed.queueItems[0].id}/review`)
      .send({ action: 'VIP' });
    expect(vipRes.status).toBe(200);
    expect(vipRes.body.success).toBe(true);

    const vipList = await queueService._getVipList();
    expect(vipList).toContain(seed.queueItems[0].id);

    const unvipRes = await request(app)
      .post(`/api/channels/${seed.channel.id}/submissions/${seed.queueItems[0].id}/review`)
      .send({ action: 'UNVIP' });
    expect(unvipRes.status).toBe(200);

    const vipAfter = await queueService._getVipList();
    expect(vipAfter).not.toContain(seed.queueItems[0].id);
  });

  test('ads/next returns next ad info when ad service available', async () => {
    const seed = await seedBasicCup(prisma, { accountId: 'acct-ads', accountUsername: 'ownerads' });
    const queueService = new QueueService({ emit: jest.fn() }, seed.channel.id);
    queueService.db = prisma;
    const adService = {
      enabled: true,
      getNextAdForChannel: jest.fn().mockResolvedValue({ live: true, nextAdAt: 'soon', duration: 30 })
    };

    const user = {
      id: seed.account.id,
      username: seed.account.username,
      displayName: seed.account.displayName,
      channels: [{ id: seed.channel.id, roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    const { app } = buildTestApp({ prisma, user, queueService, queueChannelId: seed.channel.id, adService });

    const res = await request(app).get(`/api/channels/${seed.channel.id}/ads/next`);
    expect(res.status).toBe(200);
    expect(res.body.live).toBe(true);
    expect(res.body.duration).toBe(30);
    expect(adService.getNextAdForChannel).toHaveBeenCalledWith(seed.channel.id);
  });

  test('admin debug rejects manager (non-admin twitch id)', async () => {
    const manager = await prisma.account.create({
      data: { id: 'acct-manager2', username: 'manager2', displayName: 'Manager Two', twitchId: '222' }
    });
    await prisma.channel.create({
      data: { id: 'mgrchan', displayName: 'mgrchan', isActive: true, settings: {} }
    });
    await prisma.channelOwner.create({
      data: { accountId: manager.id, channelId: 'mgrchan', role: 'MANAGER' }
    });

    const user = {
      id: manager.id,
      username: manager.username,
      displayName: manager.displayName,
      channels: [{ id: 'mgrchan', roles: [], ownershipRole: 'MANAGER' }]
    };
    const { app } = buildTestApp({ prisma, user });

    const res = await request(app).get('/api/admin/debug/info');
    expect(res.status).toBe(403);
  });

  test('public queue returns queue items', async () => {
    const seed = await seedBasicCup(prisma, { accountId: 'acct-seed', accountUsername: 'owner' });
    // Seed queue items already created by seedBasicCup
    const { app, queueService } = buildTestApp({ prisma, user: null, queueChannelId: seed.channel.id });
    queueService.channelId = seed.channel.id;

    const res = await request(app).get(`/api/channels/public/${seed.channel.id}/queue`);
    expect(res.status).toBe(200);
    expect(res.body.queue).toHaveLength(2);
    expect(res.body.channelId).toBe(seed.channel.id);
  });

  test('public queue returns 404 for inactive channel', async () => {
    await prisma.channel.create({
      data: { id: 'inactive-public', displayName: 'inactive', isActive: false, settings: {} }
    });

    const { app } = buildTestApp({ prisma, user: null, queueChannelId: 'different-channel' });
    const res = await request(app).get('/api/channels/public/inactive-public/queue');

    expect(res.status).toBe(404);
  });

  test('admin debug requires admin twitch id', async () => {
    const adminAccount = await prisma.account.create({
      data: {
        id: 'acct-admin',
        username: 'admin',
        displayName: 'Admin',
        twitchId: '77292575'
      }
    });

    const user = {
      id: adminAccount.id,
      username: adminAccount.username,
      displayName: adminAccount.displayName,
      channels: []
    };

    const { app } = buildTestApp({ prisma, user });
    const res = await request(app).get('/api/admin/debug/info');

    expect(res.status).toBe(200);
    expect(res.body.admin).toBe(true);
    expect(res.body.user.twitchId).toBe('77292575');
  });

  test('admin debug rejects non-admin', async () => {
    const account = await prisma.account.create({
      data: {
        id: 'acct-nonadmin',
        username: 'notadmin',
        displayName: 'Not Admin',
        twitchId: '111'
      }
    });

    const user = {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      channels: []
    };

    const { app } = buildTestApp({ prisma, user });
    const res = await request(app).get('/api/admin/debug/info');

    expect(res.status).toBe(403);
  });

  test('health endpoint returns healthy payload', async () => {
    const { app } = buildTestApp({ prisma, includeHealth: true });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.uptime).toBe('number');
  });
});
