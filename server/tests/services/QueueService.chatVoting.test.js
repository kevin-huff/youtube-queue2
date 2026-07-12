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

const buildService = ({ chatEnabled = true, stage = 'collecting', judges = [] } = {}) => {
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
    stage,
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
      enabled: chatEnabled,
      count: 0,
      average: null,
      locked: false,
      lockedAt: null
    }
  };

  return service;
};

const votingUpdateCalls = (service) =>
  service.io.emit.mock.calls.filter(([event]) => event === 'voting:update');

describe('QueueService chat voting', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('registerChatVote rejections', () => {
    test('rejected when no voting session', () => {
      const service = buildService();
      service.votingState = null;
      expect(service.registerChatVote('alice', 3)).toBeNull();
    });

    test('rejected when stage is not collecting', () => {
      const service = buildService({ stage: 'revealing' });
      expect(service.registerChatVote('alice', 3)).toBeNull();
      expect(service.votingState.chat.count).toBe(0);
    });

    test('rejected when chat voting is disabled', () => {
      const service = buildService({ chatEnabled: false });
      expect(service.registerChatVote('alice', 3)).toBeNull();
      expect(service.votingState.chat.count).toBe(0);
    });

    test('rejected when chat voting is locked', () => {
      const service = buildService();
      service.votingState.chat.locked = true;
      expect(service.registerChatVote('alice', 3)).toBeNull();
      expect(service.votingState.chat.count).toBe(0);
    });

    test('rejected for out-of-range or non-finite scores', () => {
      const service = buildService();
      expect(service.registerChatVote('alice', 5.1)).toBeNull();
      expect(service.registerChatVote('alice', -0.1)).toBeNull();
      expect(service.registerChatVote('alice', NaN)).toBeNull();
      expect(service.registerChatVote('alice', Infinity)).toBeNull();
      expect(service.registerChatVote('alice', 'nope')).toBeNull();
      expect(service.votingState.chat.count).toBe(0);
      expect(service.votingState.chat.average).toBeNull();
    });
  });

  describe('vote aggregation', () => {
    test('last vote per user wins', () => {
      const service = buildService();
      service.registerChatVote('alice', 1);
      service.registerChatVote('Alice', 5);
      expect(service.votingState.chat.count).toBe(1);
      expect(service.votingState.chat.average).toBe(5);
    });

    test('average and count are correct across multiple users', () => {
      const service = buildService();
      service.registerChatVote('alice', 4);
      service.registerChatVote('bob', 5);
      service.registerChatVote('carol', 2.5);
      expect(service.votingState.chat.count).toBe(3);
      expect(service.votingState.chat.average).toBe(Number(((4 + 5 + 2.5) / 3).toFixed(5)));
    });

    test('boundary scores 0 and 5 are accepted', () => {
      const service = buildService();
      expect(service.registerChatVote('alice', 0)).toEqual({ count: 1, average: 0 });
      expect(service.registerChatVote('bob', 5)).toEqual({ count: 2, average: 2.5 });
    });

    test('raw votes are not exposed in the serialized voting state', () => {
      const service = buildService();
      service.registerChatVote('alice', 4);
      const state = service.getVotingState();
      expect(JSON.stringify(state)).not.toContain('alice');
      expect(state.chat).toEqual({
        enabled: true,
        count: 1,
        average: 4,
        locked: false,
        lockedAt: null
      });
    });
  });

  describe('lock-in at first reveal', () => {
    test('appends a locked chat judge and upserts a JudgeScore row', async () => {
      const service = buildService({ judges: [buildJudge('judge-1')] });
      service.registerChatVote('alice', 4);
      service.registerChatVote('bob', 5);

      await service.advanceJudgeReveal();

      expect(service.votingState.chat.locked).toBe(true);
      expect(service.votingState.chat.lockedAt).toEqual(expect.any(String));

      const chatJudge = service.votingState.judges.find((judge) => judge.id === 'chat');
      expect(chatJudge).toMatchObject({
        name: 'Chat',
        kind: 'chat',
        score: 4.5,
        locked: true,
        lockType: 'MANUAL',
        status: 'locked',
        order: 1
      });
      expect(chatJudge.scoreId).toBe(99);

      expect(service.db.judgeScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            cupId_queueItemId_judgeTokenId: {
              cupId: 'cup-1',
              queueItemId: 42,
              judgeTokenId: 'chat'
            }
          },
          create: expect.objectContaining({
            judgeTokenId: 'chat',
            judgeName: 'Chat',
            score: 4.5,
            isLocked: true,
            lockType: 'MANUAL'
          }),
          update: expect.objectContaining({
            judgeName: 'Chat',
            score: 4.5,
            isLocked: true,
            lockType: 'MANUAL'
          })
        })
      );

      // The regular judge is still the first one revealed
      expect(service.votingState.judges[0].revealStatus).toBe('revealed');
      expect(chatJudge.revealStatus).toBe('hidden');
    });

    test('overwrites a re-seeded chat judge from a previous run with the fresh average', async () => {
      // Replayed video: startVoting re-seeded the chat judge with the old
      // run's persisted score, but chat.locked starts false so new votes
      // are collected. The lock must sync the entry to the new average.
      const staleChatJudge = buildJudge('chat', {
        name: 'Chat',
        kind: 'chat',
        score: 1.5,
        order: 1
      });
      const service = buildService({ judges: [buildJudge('judge-1'), staleChatJudge] });
      service.registerChatVote('alice', 4);
      service.registerChatVote('bob', 5);

      await service.advanceJudgeReveal();

      const chatJudge = service.votingState.judges.find((judge) => judge.id === 'chat');
      expect(chatJudge.score).toBe(4.5);
      expect(chatJudge.locked).toBe(true);
      expect(chatJudge.status).toBe('locked');
      expect(service.db.judgeScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ score: 4.5 })
        })
      );
    });

    test('locks without a judge entry or db row when there are no votes', async () => {
      const service = buildService({ judges: [buildJudge('judge-1')] });

      await service.advanceJudgeReveal();

      expect(service.votingState.chat.locked).toBe(true);
      expect(service.votingState.judges.find((judge) => judge.id === 'chat')).toBeUndefined();
      expect(service.db.judgeScore.upsert).not.toHaveBeenCalled();
    });

    test('keeps the in-memory chat judge when the upsert fails', async () => {
      const service = buildService({ judges: [buildJudge('judge-1')] });
      service.db.judgeScore.upsert.mockRejectedValue(new Error('db down'));
      service.registerChatVote('alice', 3);

      await expect(service.advanceJudgeReveal()).resolves.toBeTruthy();

      const chatJudge = service.votingState.judges.find((judge) => judge.id === 'chat');
      expect(chatJudge).toMatchObject({ kind: 'chat', score: 3, locked: true });
    });

    test('new votes are rejected once locked', async () => {
      const service = buildService({ judges: [buildJudge('judge-1')] });
      service.registerChatVote('alice', 3);

      await service.advanceJudgeReveal();

      expect(service.registerChatVote('bob', 5)).toBeNull();
      expect(service.votingState.chat.count).toBe(1);
    });
  });

  describe('broadcast throttling', () => {
    test('rapid votes emit fewer broadcasts than votes, with a trailing edge', () => {
      jest.useFakeTimers();
      const service = buildService();

      for (let i = 0; i < 5; i += 1) {
        service.registerChatVote(`user${i}`, 3);
      }

      // Leading edge only so far
      expect(votingUpdateCalls(service)).toHaveLength(1);

      jest.advanceTimersByTime(800);

      // Trailing edge carries the final tally
      const calls = votingUpdateCalls(service);
      expect(calls).toHaveLength(2);
      expect(calls[calls.length - 1][1].chat.count).toBe(5);
    });

    test('a vote after the throttle window broadcasts immediately', () => {
      jest.useFakeTimers();
      const service = buildService();

      service.registerChatVote('alice', 3);
      expect(votingUpdateCalls(service)).toHaveLength(1);

      jest.advanceTimersByTime(1000);
      service.registerChatVote('bob', 4);
      expect(votingUpdateCalls(service)).toHaveLength(2);
    });
  });

  describe('session reset', () => {
    test('cancelVoting clears chat votes and pending broadcast timers', () => {
      jest.useFakeTimers();
      const service = buildService();
      service.registerChatVote('alice', 3);
      service.registerChatVote('bob', 4);

      service.cancelVoting({ reason: 'test' });

      expect(service.chatVotes.size).toBe(0);
      expect(service.chatVoteBroadcastTimer).toBeNull();
      expect(jest.getTimerCount()).toBe(0);
    });

    test('completeVoting clears chat votes', () => {
      const service = buildService();
      service.registerChatVote('alice', 3);

      service.completeVoting({ reason: 'test' });

      expect(service.chatVotes.size).toBe(0);
      expect(service.chatVoteBroadcastTimer).toBeNull();
    });
  });
});
