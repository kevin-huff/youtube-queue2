const express = require('express');
const request = require('supertest');

const apiRouter = require('../../src/api');

const createApp = (channelManagerOverrides = {}) => {
  const app = express();
  app.use(express.json());

  const channelManager = {
    getChannelInfo: jest.fn(),
    getQueueService: jest.fn(),
    ...channelManagerOverrides
  };

  app.set('channelManager', channelManager);
  app.use('/api', apiRouter);
  return { app, channelManager };
};

describe('Public channel endpoints', () => {
  test('GET /api/channels/public/:channelName returns channel info when active', async () => {
    const { app, channelManager } = createApp();
    channelManager.getChannelInfo.mockResolvedValue({
      id: 'test_channel',
      displayName: 'Test Channel',
      isActive: true
    });

    const res = await request(app).get('/api/channels/public/test_channel');

    expect(res.status).toBe(200);
    expect(res.body.channel).toMatchObject({
      id: 'test_channel',
      displayName: 'Test Channel',
      isActive: true
    });
  });

  test('GET /api/channels/public/:channelName returns 404 when inactive', async () => {
    const { app, channelManager } = createApp();
    channelManager.getChannelInfo.mockResolvedValue({
      id: 'test_channel',
      displayName: 'Test Channel',
      isActive: false
    });

    const res = await request(app).get('/api/channels/public/test_channel');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('GET /api/channels/public/:channelName/queue returns queue and currentlyPlaying', async () => {
    const mockQueue = [{ id: 1, title: 'Song', status: 'PENDING' }];
    const mockCurrent = { id: 1, title: 'Song', status: 'PLAYING' };

    const queueService = {
      getCurrentQueue: jest.fn().mockResolvedValue(mockQueue),
      currentlyPlaying: mockCurrent
    };
    const { app, channelManager } = createApp({
      getQueueService: jest.fn(() => queueService),
      getChannelInfo: jest.fn().mockResolvedValue({ id: 'test_channel', isActive: true })
    });

    const res = await request(app).get('/api/channels/public/test_channel/queue');

    expect(res.status).toBe(200);
    expect(res.body.queue).toEqual(mockQueue);
    expect(res.body.currentlyPlaying).toEqual(mockCurrent);
    expect(queueService.getCurrentQueue).toHaveBeenCalledTimes(1);
  });

  test('GET /api/channels/public/:channelName/queue returns 404 when queue service missing', async () => {
    const { app, channelManager } = createApp({
      getQueueService: jest.fn(() => null),
      getChannelInfo: jest.fn().mockResolvedValue({ id: 'test_channel', isActive: true })
    });

    const res = await request(app).get('/api/channels/public/test_channel/queue');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
