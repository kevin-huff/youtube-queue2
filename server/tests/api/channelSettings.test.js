const express = require('express');
const request = require('supertest');
const apiRouter = require('../../src/api');

const createAuthedApp = (overrides = {}) => {
  const app = express();
  app.use(express.json());

  // Always present an authenticated user for these routes
  app.use((req, res, next) => {
    req.isAuthenticated = () => true;
    req.user = overrides.user || {
      id: 'user-1',
      channels: [{ id: 'mychan', roles: ['OWNER'], ownershipRole: 'OWNER' }]
    };
    next();
  });

  const defaultQueueService = {
    getSetting: jest.fn(async (_key, fallback) => fallback),
    io: { emit: jest.fn() }
  };

  const channelManager = {
    getQueueService: jest.fn(() => defaultQueueService),
    getUserChannels: jest.fn().mockResolvedValue(['mychan']),
    prisma: {
      cup: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'cup-123', channelId: 'mychan', isActive: true })
      }
    },
    ...overrides.channelManager
  };

  app.set('channelManager', channelManager);
  app.use('/api', apiRouter);

  return { app, channelManager, queueService: channelManager.getQueueService() };
};

describe('Channel settings and active cup propagation', () => {
  test('GET /api/channels/:channelId/settings includes activeCupId when one is active', async () => {
    const { app, channelManager } = createAuthedApp({
      channelManager: {
        prisma: {
          cup: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cup-123' })
          }
        }
      }
    });

    const res = await request(app).get('/api/channels/mychan/settings');

    expect(res.status).toBe(200);
    expect(res.body.settings.activeCupId).toBe('cup-123');
    expect(channelManager.getUserChannels).toHaveBeenCalledWith('user-1');
  });

  test('GET /api/channels/:channelId/settings returns null activeCupId when none active', async () => {
    const { app } = createAuthedApp();

    const res = await request(app).get('/api/channels/mychan/settings');

    expect(res.status).toBe(200);
    expect(res.body.settings.activeCupId).toBeNull();
  });

  test('PATCH /api/channels/:channelId/cups/:cupId/set-active broadcasts setting:updated', async () => {
    const { app, queueService, channelManager } = createAuthedApp();
    const res = await request(app).patch('/api/channels/mychan/cups/cup-123/set-active');

    expect(res.status).toBe(200);
    expect(res.body.cup.id).toBe('cup-123');
    expect(channelManager.prisma.cup.updateMany).toHaveBeenCalledWith({
      where: { channelId: 'mychan' },
      data: { isActive: false }
    });
    expect(queueService.io.emit).toHaveBeenCalledWith('setting:updated', {
      key: 'activeCupId',
      value: 'cup-123'
    });
  });
});
