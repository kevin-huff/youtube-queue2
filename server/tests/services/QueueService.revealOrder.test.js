const QueueService = require('../../src/services/QueueService');

const buildJudge = (id, overrides = {}) => ({
  id,
  name: id,
  shortName: 'JG',
  kind: 'token',
  sessionId: null,
  status: 'locked',
  score: 4,
  scoreId: 1,
  locked: true,
  lockType: 'MANUAL',
  lockedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  revealStatus: 'hidden',
  revealAt: null,
  order: 0,
  connected: true,
  metadata: {},
  ...overrides
});

const buildService = ({ judges = [] } = {}) => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');
  const startedAt = new Date().toISOString();

  service.db = {
    judgeScore: {
      upsert: jest.fn().mockResolvedValue({ id: 99 })
    }
  };

  service.votingState = {
    channelId: 'testchannel',
    queueItemId: 42,
    cupId: 'cup-1',
    stage: 'collecting',
    revealIndex: -1,
    startedAt,
    updatedAt: startedAt,
    lastEvent: 'start',
    history: [],
    judges,
    metrics: {
      totalJudges: judges.length,
      submitted: 0,
      locked: 0
    },
    computedAverage: null,
    computedTotal: null,
    computedSocial: null,
    socialBaseline: { meanScore: 3.4, totalVotes: 0, minimumVotes: 3 },
    socialBreakdown: null,
    chat: {
      enabled: false,
      count: 0,
      average: null,
      locked: false,
      lockedAt: null
    }
  };

  return service;
};

describe('QueueService reveal ordering', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('targeted reveal (judgeId)', () => {
    test('reveals the requested judge without skipping earlier judges', async () => {
      const judges = [
        buildJudge('alice', { order: 0 }),
        buildJudge('bob', { order: 1 }),
        buildJudge('carol', { order: 2 })
      ];
      const service = buildService({ judges });

      const state = await service.advanceJudgeReveal({ judgeId: 'carol' });

      expect(state.judges.find((j) => j.id === 'carol').revealStatus).toBe('revealed');
      expect(state.judges.find((j) => j.id === 'alice').revealStatus).toBe('hidden');
      expect(state.judges.find((j) => j.id === 'bob').revealStatus).toBe('hidden');
      expect(state.stage).toBe('revealing');
    });

    test('throws when the judge does not have a locked score', async () => {
      const judges = [buildJudge('alice', { locked: false, status: 'scored' })];
      const service = buildService({ judges });

      await expect(service.advanceJudgeReveal({ judgeId: 'alice' }))
        .rejects.toThrow('Judge does not have a locked score to reveal');
      expect(service.votingState.judges[0].revealStatus).toBe('hidden');
    });

    test('throws when the judge is already revealed', async () => {
      const judges = [buildJudge('alice', { revealStatus: 'revealed', status: 'revealed' })];
      const service = buildService({ judges });

      await expect(service.advanceJudgeReveal({ judgeId: 'alice' }))
        .rejects.toThrow('Judge has already been revealed');
    });

    test('throws when the judge is unknown', async () => {
      const service = buildService({ judges: [buildJudge('alice')] });

      await expect(service.advanceJudgeReveal({ judgeId: 'nobody' }))
        .rejects.toThrow('Judge not found in this voting session');
    });
  });

  describe('random reveal', () => {
    test('reveals a locked judge and leaves unlocked judges untouched', async () => {
      const judges = [
        buildJudge('alice', { locked: false, status: 'scored' }),
        buildJudge('bob'),
        buildJudge('carol')
      ];
      const service = buildService({ judges });

      const state = await service.advanceJudgeReveal({ random: true });

      const revealed = state.judges.filter((j) => j.revealStatus === 'revealed');
      expect(revealed).toHaveLength(1);
      expect(['bob', 'carol']).toContain(revealed[0].id);
      expect(state.judges.find((j) => j.id === 'alice').revealStatus).toBe('hidden');
    });

    test('never picks the chat judge while other candidates remain', async () => {
      const judges = [
        buildJudge('chat', { kind: 'chat' }),
        buildJudge('bob')
      ];
      const service = buildService({ judges });
      jest.spyOn(Math, 'random').mockReturnValue(0.99);

      const state = await service.advanceJudgeReveal({ random: true });

      expect(state.judges.find((j) => j.id === 'bob').revealStatus).toBe('revealed');
      expect(state.judges.find((j) => j.id === 'chat').revealStatus).toBe('hidden');
    });

    test('picks the chat judge when it is the only candidate left', async () => {
      const judges = [
        buildJudge('chat', { kind: 'chat' }),
        buildJudge('bob', { revealStatus: 'revealed', status: 'revealed' })
      ];
      const service = buildService({ judges });

      const state = await service.advanceJudgeReveal({ random: true });

      expect(state.judges.find((j) => j.id === 'chat').revealStatus).toBe('revealed');
    });

    test('throws when no locked judges remain', async () => {
      const judges = [buildJudge('alice', { locked: false, status: 'scored' })];
      const service = buildService({ judges });

      await expect(service.advanceJudgeReveal({ random: true }))
        .rejects.toThrow('No judges available to reveal');
    });
  });

  describe('sequential reveal (default)', () => {
    test('still walks in order and excludes unlocked judges it passes', async () => {
      const judges = [
        buildJudge('alice', { locked: false, status: 'scored' }),
        buildJudge('bob')
      ];
      const service = buildService({ judges });

      const state = await service.advanceJudgeReveal();

      expect(state.judges.find((j) => j.id === 'alice').revealStatus).toBe('skipped');
      expect(state.judges.find((j) => j.id === 'bob').revealStatus).toBe('revealed');
    });
  });
});
