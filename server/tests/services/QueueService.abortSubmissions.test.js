const QueueService = require('../../src/services/QueueService');

const buildService = ({ items = [], vipList = [] } = {}) => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');

  service.db = {
    queueItem: {
      findMany: jest.fn().mockResolvedValue(items),
      updateMany: jest.fn().mockResolvedValue({ count: items.length })
    },
    submissionLog: {
      create: jest.fn().mockResolvedValue({})
    }
  };

  jest.spyOn(service, '_getVipList').mockResolvedValue([...vipList]);
  jest.spyOn(service, '_setVipList').mockResolvedValue();
  jest.spyOn(service, 'reorderQueue').mockResolvedValue();

  return { service, io };
};

describe('QueueService.abortUserSubmissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('removes all unwatched items for the user and reports the count', async () => {
    const items = [
      { id: 1, title: 'Video A', videoId: 'aaa' },
      { id: 2, title: 'Video B', videoId: 'bbb' }
    ];
    const { service, io } = buildService({ items });

    const result = await service.abortUserSubmissions('SomeViewer');

    expect(result).toEqual({ removed: 2 });

    const findArgs = service.db.queueItem.findMany.mock.calls[0][0];
    expect(findArgs.where.submitterUsername).toBe('someviewer');
    expect(findArgs.where.status.in).toEqual(['PENDING', 'APPROVED', 'TOP_EIGHT']);

    const updateArgs = service.db.queueItem.updateMany.mock.calls[0][0];
    expect(updateArgs.where.id.in).toEqual([1, 2]);
    expect(updateArgs.data.status).toBe('REMOVED');

    expect(service.reorderQueue).toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith('queue:video_removed', { id: 1 });
    expect(io.emit).toHaveBeenCalledWith('queue:video_removed', { id: 2 });
  });

  test('returns zero and touches nothing when the user has no active items', async () => {
    const { service, io } = buildService({ items: [] });

    const result = await service.abortUserSubmissions('someviewer');

    expect(result).toEqual({ removed: 0 });
    expect(service.db.queueItem.updateMany).not.toHaveBeenCalled();
    expect(service.reorderQueue).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  test('returns zero for an empty username without querying', async () => {
    const { service } = buildService();

    const result = await service.abortUserSubmissions('');

    expect(result).toEqual({ removed: 0 });
    expect(service.db.queueItem.findMany).not.toHaveBeenCalled();
  });

  test('drops the user items from the VIP list and broadcasts the update', async () => {
    const items = [{ id: 5, title: 'VIP Video', videoId: 'vvv' }];
    const { service, io } = buildService({ items, vipList: [5, 9] });

    await service.abortUserSubmissions('someviewer');

    expect(service._setVipList).toHaveBeenCalledWith([9]);
    expect(io.emit).toHaveBeenCalledWith('queue:vip_updated', {
      channelId: 'testchannel',
      vipQueue: [9]
    });
  });

  test('leaves the VIP list alone when none of the items are VIP', async () => {
    const items = [{ id: 5, title: 'Video', videoId: 'vvv' }];
    const { service } = buildService({ items, vipList: [9] });

    await service.abortUserSubmissions('someviewer');

    expect(service._setVipList).not.toHaveBeenCalled();
  });

  test('logs the abort with count and titles', async () => {
    const items = [{ id: 1, title: 'Video A', videoId: 'aaa' }];
    const { service } = buildService({ items });
    jest.spyOn(service, 'logSubmission');

    await service.abortUserSubmissions('someviewer');

    expect(service.logSubmission).toHaveBeenCalledWith('someviewer', 'ABORT_SUBMISSIONS', {
      count: 1,
      titles: ['Video A']
    });
  });
});
