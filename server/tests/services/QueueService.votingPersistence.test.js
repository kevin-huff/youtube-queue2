const QueueService = require('../../src/services/QueueService');

const buildVotingState = (overrides = {}) => ({
  channelId: 'testchannel',
  queueItemId: 42,
  cupId: 'cup-1',
  queueItem: { id: 42, title: 'Test Video' },
  stage: 'collecting',
  revealIndex: -1,
  goldenBuzzer: null,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastEvent: 'start',
  history: [],
  judges: [
    {
      id: 'judge_a', name: 'A', shortName: 'A', kind: 'token', sessionId: null,
      status: 'scored', score: 4, scoreId: 1, locked: false, lockType: null,
      lockedAt: null, updatedAt: new Date().toISOString(), revealStatus: 'hidden',
      revealAt: null, order: 0, connected: true, metadata: {}
    }
  ],
  metrics: { totalJudges: 1, submitted: 1, locked: 0 },
  computedAverage: 4,
  computedTotal: 4,
  computedSocial: null,
  socialBaseline: { meanScore: 3.4, totalVotes: 0, minimumVotes: 3 },
  socialBreakdown: null,
  revealedAverage: null,
  revealedAverageAt: null,
  revealedSocial: null,
  revealedSocialAt: null,
  chat: { enabled: false, count: 0, average: null, locked: false, lockedAt: null },
  ...overrides
});

const buildService = () => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');
  service.db = {
    botSetting: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null)
    }
  };
  return { service, io };
};

describe('QueueService voting snapshot persistence', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('persists an envelope with voting state and chat votes while active', async () => {
    const { service } = buildService();
    service.votingState = buildVotingState();
    service.chatVotes = new Map([['viewer1', 4.5]]);

    await service._persistVotingState();

    const args = service.db.botSetting.upsert.mock.calls[0][0];
    expect(args.where.channelId_key.key).toBe('voting_state_snapshot');
    const envelope = JSON.parse(args.update.value);
    expect(envelope.votingState.queueItemId).toBe(42);
    expect(envelope.chatVotes).toEqual([['viewer1', 4.5]]);
    expect(envelope.savedAt).toBeTruthy();
  });

  test('clears the snapshot when no session is active', async () => {
    const { service } = buildService();
    service.votingState = null;

    await service._persistVotingState();

    const args = service.db.botSetting.upsert.mock.calls[0][0];
    expect(args.update.value).toBe('');
  });

  test('clears the snapshot for completed sessions', async () => {
    const { service } = buildService();
    service.votingState = buildVotingState({ stage: 'completed' });

    await service._persistVotingState();

    expect(service.db.botSetting.upsert.mock.calls[0][0].update.value).toBe('');
  });

  test('restores an active snapshot with chat votes and broadcasts', async () => {
    const { service, io } = buildService();
    service.db.botSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        votingState: buildVotingState({ stage: 'revealing' }),
        chatVotes: [['viewer1', 3]]
      })
    });

    await service._restoreVotingState();

    expect(service.votingState).not.toBeNull();
    expect(service.votingState.stage).toBe('revealing');
    expect(service.votingState.queueItemId).toBe(42);
    expect(service.chatVotes.get('viewer1')).toBe(3);
    expect(io.emit).toHaveBeenCalledWith('voting:update', expect.objectContaining({ lastEvent: 'restored' }));
  });

  test('ignores snapshots for completed sessions', async () => {
    const { service } = buildService();
    service.db.botSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        votingState: buildVotingState({ stage: 'completed' }),
        chatVotes: []
      })
    });

    await service._restoreVotingState();
    expect(service.votingState).toBeNull();
  });

  test('ignores stale snapshots older than the max age', async () => {
    const { service } = buildService();
    service.db.botSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({
        version: 1,
        savedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
        votingState: buildVotingState(),
        chatVotes: []
      })
    });

    await service._restoreVotingState();
    expect(service.votingState).toBeNull();
  });

  test('survives corrupt snapshot data', async () => {
    const { service } = buildService();
    service.db.botSetting.findUnique.mockResolvedValue({ value: '{corrupt' });

    await expect(service._restoreVotingState()).resolves.toBeUndefined();
    expect(service.votingState).toBeNull();
  });

  test('touching voting state schedules a debounced persist', async () => {
    jest.useFakeTimers();
    const { service } = buildService();
    service.votingState = buildVotingState();
    const persistSpy = jest.spyOn(service, '_persistVotingState').mockResolvedValue();

    service._touchVotingState('test-event');
    service._touchVotingState('test-event-2');
    expect(persistSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(800);
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });
});

describe('QueueService._withVotingLock', () => {
  test('serializes async operations in call order', async () => {
    const { service } = buildService();
    const order = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

    const first = service._withVotingLock(async () => {
      order.push('first:start');
      await firstGate;
      order.push('first:end');
      return 1;
    });
    const second = service._withVotingLock(async () => {
      order.push('second:start');
      return 2;
    });

    // second must not start while first is in flight
    await Promise.resolve();
    expect(order).toEqual(['first:start']);

    releaseFirst();
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  test('a rejected operation does not poison the chain', async () => {
    const { service } = buildService();

    await expect(service._withVotingLock(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    await expect(service._withVotingLock(async () => 'ok')).resolves.toBe('ok');
  });
});
