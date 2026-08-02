const QueueService = require('../../src/services/QueueService');

const buildJudge = (id, overrides = {}) => ({
  id,
  name: id,
  shortName: 'JG',
  kind: 'token',
  sessionId: null,
  status: 'scored',
  score: 2,
  scoreId: 1,
  locked: false,
  lockType: null,
  lockedAt: null,
  updatedAt: new Date().toISOString(),
  revealStatus: 'hidden',
  revealAt: null,
  order: 0,
  connected: true,
  metadata: {},
  ...overrides
});

const buildService = ({ judges = [], votingOverrides = {} } = {}) => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');
  const startedAt = new Date().toISOString();

  service.votingState = {
    channelId: 'testchannel',
    queueItemId: 42,
    cupId: 'cup-1',
    queueItem: { id: 42, title: 'Test Video' },
    stage: 'collecting',
    revealIndex: -1,
    goldenBuzzer: null,
    startedAt,
    updatedAt: startedAt,
    lastEvent: 'start',
    history: [],
    judges,
    metrics: { totalJudges: judges.length, submitted: 0, locked: 0 },
    computedAverage: null,
    computedTotal: null,
    computedSocial: null,
    socialBaseline: { meanScore: 3.4, totalVotes: 0, minimumVotes: 3 },
    socialBreakdown: null,
    revealedAverage: null,
    revealedAverageAt: null,
    revealedSocial: null,
    revealedSocialAt: null,
    chat: { enabled: false, count: 0, average: null, locked: false, lockedAt: null },
    ...votingOverrides
  };

  return { service, io };
};

describe('QueueService golden buzzer', () => {
  describe('assertGoldenBuzzerAllowed', () => {
    test('rejects when no voting session is active', () => {
      const { service } = buildService();
      service.votingState = null;

      expect(() => service.assertGoldenBuzzerAllowed(42, 'judge_a'))
        .toThrow('active voting session');
    });

    test('rejects when voting is already completed', () => {
      const { service } = buildService({ votingOverrides: { stage: 'completed' } });

      expect(() => service.assertGoldenBuzzerAllowed(42, 'judge_a'))
        .toThrow('active voting session');
    });

    test('rejects for a different queue item', () => {
      const { service } = buildService();

      expect(() => service.assertGoldenBuzzerAllowed(99, 'judge_a'))
        .toThrow('currently being judged');
    });

    test('rejects when this video already has a golden buzzer', () => {
      const { service } = buildService({
        votingOverrides: { goldenBuzzer: { judgeId: 'judge_b', judgeName: 'B', at: new Date().toISOString() } }
      });

      expect(() => service.assertGoldenBuzzerAllowed(42, 'judge_a'))
        .toThrow('already been hit');
    });

    test('rejects a judge who already used theirs this stream', () => {
      const { service } = buildService();
      service.goldenBuzzerUsage.set('judge_a', { judgeId: 'judge_a' });

      expect(() => service.assertGoldenBuzzerAllowed(42, 'judge_a'))
        .toThrow('already used your golden buzzer');
    });
  });

  describe('recordGoldenBuzzer', () => {
    test('overrides every judge with a locked perfect score and broadcasts', () => {
      const judges = [
        buildJudge('judge_a', { score: 1.5 }),
        buildJudge('judge_b', { score: 4, locked: true, lockType: 'MANUAL' }),
        buildJudge('chat', { kind: 'chat', score: 2.2 })
      ];
      const { service, io } = buildService({ judges });

      const payload = service.recordGoldenBuzzer(42, 'judge_a', 'Judge A');

      service.votingState.judges.forEach((judge) => {
        expect(judge.score).toBe(5);
        expect(judge.locked).toBe(true);
        expect(judge.lockType).toBe('FORCED');
        expect(judge.status).toBe('locked');
      });

      expect(service.votingState.computedAverage).toBe(5);
      expect(service.votingState.goldenBuzzer).toMatchObject({ judgeId: 'judge_a' });
      expect(service.goldenBuzzerUsage.has('judge_a')).toBe(true);
      expect(payload.score).toBe(5);
      expect(payload.queueItem).toMatchObject({ id: 42, title: 'Test Video' });

      const emitted = io.emit.mock.calls.map(([eventName]) => eventName);
      expect(emitted).toContain('golden_buzzer:activated');
      expect(emitted).toContain('golden_buzzer:state');
      expect(emitted).toContain('voting:update');
    });

    test('uses the panel name for the buzzing judge when available', () => {
      const judges = [buildJudge('judge_a', { name: 'The Hammer' })];
      const { service } = buildService({ judges });

      const payload = service.recordGoldenBuzzer(42, 'judge_a', 'fallback name');

      expect(payload.judgeName).toBe('The Hammer');
    });

    test('enforces once per stream across videos', () => {
      const { service } = buildService({ judges: [buildJudge('judge_a')] });
      service.recordGoldenBuzzer(42, 'judge_a');

      // next video, new voting session
      service.votingState.queueItemId = 43;
      service.votingState.goldenBuzzer = null;

      expect(() => service.recordGoldenBuzzer(43, 'judge_a'))
        .toThrow('already used your golden buzzer');
    });
  });

  describe('resetGoldenBuzzers', () => {
    test('clears usage so judges can buzz again', () => {
      const { service, io } = buildService({ judges: [buildJudge('judge_a')] });
      service.recordGoldenBuzzer(42, 'judge_a');
      io.emit.mockClear();

      const state = service.resetGoldenBuzzers('producer');

      expect(state.usedBy).toEqual([]);
      expect(service.goldenBuzzerUsage.size).toBe(0);
      expect(io.emit).toHaveBeenCalledWith('golden_buzzer:state', expect.objectContaining({ reason: 'reset' }));
    });
  });

  describe('reveal interactions', () => {
    test('golden buzzer bypasses the duplicate must-beat penalty on average reveal', async () => {
      const judges = [buildJudge('judge_a', { revealStatus: 'revealed', locked: true })];
      const { service } = buildService({
        judges,
        votingOverrides: { duplicate: { averageToBeat: 5 } }
      });

      service.recordGoldenBuzzer(42, 'judge_a');
      service.votingState.judges.forEach((judge) => {
        judge.revealStatus = 'revealed';
      });

      const state = service.revealAverage();

      // 5 does not strictly beat 5, but the golden buzzer skips the zeroing
      expect(state.revealedAverage).toBe(5);
    });
  });
});
