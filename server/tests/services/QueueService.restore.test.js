const QueueService = require('../../src/services/QueueService');

const buildService = () => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');
  service.reorderQueue = jest.fn().mockResolvedValue();
  service.addVipForItem = jest.fn().mockResolvedValue(true);
  service.logSubmission = jest.fn().mockResolvedValue();
  return service;
};

const stubItem = (overrides = {}) => ({
  id: 42,
  channelId: 'testchannel',
  status: 'SKIPPED',
  title: 'Test Video',
  videoId: 'abc123',
  ...overrides
});

describe('QueueService.restoreQueueItem', () => {
  test('restores a skipped item to APPROVED and clears playedAt', async () => {
    const service = buildService();
    const found = stubItem();
    service.db = {
      queueItem: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(found) // initial lookup
          .mockResolvedValueOnce({ ...found, status: 'APPROVED', submitter: null }), // re-fetch
        update: jest.fn().mockResolvedValue({})
      }
    };

    await service.restoreQueueItem(42, 'producer');

    expect(service.db.queueItem.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: 'APPROVED', moderationStatus: 'APPROVED', playedAt: null }
    });
    expect(service.addVipForItem).not.toHaveBeenCalled();
    expect(service.reorderQueue).toHaveBeenCalled();
  });

  test('asVip restores then adds to the VIP lane', async () => {
    const service = buildService();
    const found = stubItem({ status: 'PLAYED' });
    service.db = {
      queueItem: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(found)
          .mockResolvedValueOnce({ ...found, status: 'APPROVED', submitter: null }),
        update: jest.fn().mockResolvedValue({})
      }
    };

    await service.restoreQueueItem(42, 'producer', { asVip: true });

    expect(service.addVipForItem).toHaveBeenCalledWith(42);
  });

  test('rejects an item that is not in a terminal status', async () => {
    const service = buildService();
    service.db = {
      queueItem: {
        findUnique: jest.fn().mockResolvedValueOnce(stubItem({ status: 'APPROVED' })),
        update: jest.fn()
      }
    };

    await expect(service.restoreQueueItem(42, 'producer')).rejects.toMatchObject({
      message: 'Only ended videos can be restored to the queue',
      status: 400
    });
    expect(service.db.queueItem.update).not.toHaveBeenCalled();
  });

  test('rejects the currently playing item', async () => {
    const service = buildService();
    service.currentlyPlaying = { id: 42 };
    service.db = {
      queueItem: {
        findUnique: jest.fn().mockResolvedValueOnce(stubItem({ status: 'PLAYING' })),
        update: jest.fn()
      }
    };

    await expect(service.restoreQueueItem(42, 'producer')).rejects.toMatchObject({
      message: 'That video is currently playing',
      status: 400
    });
  });

  test('rejects an item from another channel', async () => {
    const service = buildService();
    service.db = {
      queueItem: {
        findUnique: jest.fn().mockResolvedValueOnce(stubItem({ channelId: 'otherchannel' })),
        update: jest.fn()
      }
    };

    await expect(service.restoreQueueItem(42, 'producer')).rejects.toMatchObject({
      message: 'Queue item not found for this channel',
      status: 404
    });
  });

  test('rejects a non-integer id', async () => {
    const service = buildService();
    service.db = { queueItem: { findUnique: jest.fn(), update: jest.fn() } };

    await expect(service.restoreQueueItem('abc', 'producer')).rejects.toMatchObject({
      status: 400
    });
    expect(service.db.queueItem.findUnique).not.toHaveBeenCalled();
  });
});
