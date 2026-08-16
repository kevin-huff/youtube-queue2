const QueueService = require('../../src/services/QueueService');
const logger = require('../../src/utils/logger');

const VIDEO = {
  url: 'https://youtube.com/watch?v=abc12345678',
  videoId: 'abc12345678',
  platform: 'youtube',
  title: 'Test Video',
  thumbnail: 'https://img/thumb.jpg',
  duration: 120
};

const buildService = ({ txOverrides = {} } = {}) => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');

  const tx = {
    queueItem: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 77, ...data }))
    },
    user: {
      upsert: jest.fn().mockResolvedValue({})
    },
    ...txOverrides
  };

  service.db = {
    $transaction: jest.fn((fn) => fn(tx)),
    cup: { findFirst: jest.fn().mockResolvedValue(null) },
    submissionLog: { create: jest.fn().mockResolvedValue({}) }
  };

  jest.spyOn(service, 'isQueueEnabled').mockResolvedValue(true);
  jest.spyOn(service, 'getSetting').mockImplementation(async (_key, fallback) => fallback);
  jest.spyOn(service, 'checkSubmissionCooldown').mockResolvedValue();
  jest.spyOn(service, 'getDuplicateInfo').mockResolvedValue({ activeItem: null, previousItem: null });
  jest.spyOn(service, '_generateUniqueAlias').mockResolvedValue('Anon-Test');
  jest.spyOn(service, '_getVipList').mockResolvedValue([]);
  jest.spyOn(service, '_hydrateQueueItem').mockImplementation(async (item) => item);

  return { service, tx, io };
};

describe('QueueService.addToQueue transactional checks', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('runs checks and insert inside a serializable transaction', async () => {
    const { service, tx } = buildService();

    const result = await service.addToQueue(VIDEO, 'viewer1');

    expect(service.db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );
    expect(tx.queueItem.count).toHaveBeenCalled();
    expect(tx.user.upsert).toHaveBeenCalled();
    expect(tx.queueItem.create).toHaveBeenCalled();
    expect(result.queueItem.position).toBe(1);
  });

  test('rejects inside the transaction when the queue is full', async () => {
    const { service, tx } = buildService();
    service.getSetting.mockImplementation(async (key, fallback) =>
      key === 'max_queue_size' ? '2' : fallback
    );
    tx.queueItem.count.mockResolvedValue(2);

    await expect(service.addToQueue(VIDEO, 'viewer1'))
      .rejects.toThrow('Queue is full (max 2 items)');
    expect(tx.queueItem.create).not.toHaveBeenCalled();
  });

  test('rejects inside the transaction when an active duplicate exists', async () => {
    const { service, tx } = buildService();
    tx.queueItem.findFirst.mockImplementation(async (args) =>
      args?.where?.videoId ? { id: 5 } : null
    );

    await expect(service.addToQueue(VIDEO, 'viewer1'))
      .rejects.toThrow('This video is already in the queue');
    expect(tx.queueItem.create).not.toHaveBeenCalled();
  });

  test('rejects inside the transaction when the per-user limit is hit', async () => {
    const { service, tx } = buildService();
    tx.queueItem.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await expect(service.addToQueue(VIDEO, 'viewer1'))
      .rejects.toThrow('You already have 3 videos in the queue.');
    expect(tx.queueItem.create).not.toHaveBeenCalled();
  });

  test('ignores VIP items when counting toward the per-user limit', async () => {
    const { service, tx } = buildService();
    service._getVipList.mockResolvedValue([1, 2]);
    tx.queueItem.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await service.addToQueue(VIDEO, 'viewer1');
    expect(result.queueItem).toBeTruthy();
  });

  test('derives the next position from the max active position', async () => {
    const { service, tx } = buildService();
    tx.queueItem.findFirst.mockImplementation(async (args) =>
      args?.orderBy?.position === 'desc' ? { position: 7 } : null
    );

    const result = await service.addToQueue(VIDEO, 'viewer1');
    expect(result.queueItem.position).toBe(8);
  });
});

describe('QueueService.addToQueue cup auto-assignment', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('assigns the active cup regardless of its lifecycle status', async () => {
    const { service, tx } = buildService();
    service.db.cup.findFirst.mockResolvedValue({ id: 'cup-1', status: 'SCHEDULED' });

    await service.addToQueue(VIDEO, 'viewer1');

    expect(tx.queueItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cupId: 'cup-1' }) })
    );
  });

  test('never assigns a finished cup', async () => {
    const { service } = buildService();

    await service._findAssignableCup();

    expect(service.db.cup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          status: { notIn: ['COMPLETED', 'CANCELLED'] }
        })
      })
    );
  });

  test('warns when an unfinished cup exists but is not marked active', async () => {
    const { service } = buildService();
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    service.db.cup.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'cup-2', title: 'Notthemama', status: 'LIVE' });

    const result = await service._findAssignableCup();

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not marked active'),
      expect.objectContaining({ cupId: 'cup-2', cupStatus: 'LIVE' })
    );
  });

  test('stays quiet when the channel simply has no cups', async () => {
    const { service } = buildService();
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const result = await service._findAssignableCup();

    expect(result).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('QueueService._runSerializableTransaction', () => {
  test('retries on P2034 write conflicts and succeeds', async () => {
    const io = { emit: jest.fn() };
    const service = new QueueService(io, 'testchannel');
    const conflict = Object.assign(new Error('write conflict'), { code: 'P2034' });

    service.db = {
      $transaction: jest.fn()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce('ok')
    };

    await expect(service._runSerializableTransaction(async () => {})).resolves.toBe('ok');
    expect(service.db.$transaction).toHaveBeenCalledTimes(2);
  });

  test('gives up after the retry budget and rethrows', async () => {
    const io = { emit: jest.fn() };
    const service = new QueueService(io, 'testchannel');
    const conflict = Object.assign(new Error('write conflict'), { code: 'P2034' });

    service.db = { $transaction: jest.fn().mockRejectedValue(conflict) };

    await expect(service._runSerializableTransaction(async () => {}, { retries: 3 }))
      .rejects.toThrow('write conflict');
    expect(service.db.$transaction).toHaveBeenCalledTimes(3);
  });

  test('does not retry non-conflict errors', async () => {
    const io = { emit: jest.fn() };
    const service = new QueueService(io, 'testchannel');

    service.db = { $transaction: jest.fn().mockRejectedValue(new Error('boom')) };

    await expect(service._runSerializableTransaction(async () => {}))
      .rejects.toThrow('boom');
    expect(service.db.$transaction).toHaveBeenCalledTimes(1);
  });
});
