const JudgeService = require('../../src/services/JudgeService');

const buildService = ({ votingJudges = [], existingRows = [] } = {}) => {
  const io = { emit: jest.fn() };
  const service = new JudgeService(io, 'testchannel');

  service.db = {
    judgeScore: {
      updateMany: jest.fn().mockResolvedValue({ count: existingRows.length }),
      findMany: jest.fn().mockResolvedValue(existingRows),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))
    }
  };

  const queueService = {
    assertGoldenBuzzerAllowed: jest.fn(),
    getVotingState: jest.fn().mockReturnValue({ judges: votingJudges }),
    recordGoldenBuzzer: jest.fn().mockReturnValue({
      judgeId: 'judge_a',
      judgeName: 'Judge A',
      score: 5,
      at: new Date().toISOString()
    }),
    votingState: null
  };
  service.bindQueueService(queueService);

  return { service, queueService, io };
};

describe('JudgeService.activateGoldenBuzzer', () => {
  test('forces every existing score row to 5 and locks it', async () => {
    const { service } = buildService({
      votingJudges: [{ id: 'judge_a', name: 'A', kind: 'token' }],
      existingRows: [{ judgeAccountId: null, judgeTokenId: 'judge_a' }]
    });

    const result = await service.activateGoldenBuzzer('cup-1', 42, 'judge_a', 'Judge A');

    const updateArgs = service.db.judgeScore.updateMany.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ cupId: 'cup-1', queueItemId: 42 });
    expect(updateArgs.data).toMatchObject({ score: 5, isLocked: true, lockType: 'FORCED' });
    expect(result.overridden).toBe(1);
    expect(result.created).toBe(0);
  });

  test('creates perfect-score rows for panel judges without one, skipping chat', async () => {
    const { service } = buildService({
      votingJudges: [
        { id: 'judge_a', name: 'A', kind: 'token' },
        { id: 'judge_b', name: 'B', kind: 'token' },
        { id: 'chat', name: 'Chat', kind: 'chat' }
      ],
      existingRows: [{ judgeAccountId: null, judgeTokenId: 'judge_a' }]
    });

    const result = await service.activateGoldenBuzzer('cup-1', 42, 'judge_a', 'Judge A');

    expect(result.created).toBe(1);
    const createArgs = service.db.judgeScore.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      cupId: 'cup-1',
      queueItemId: 42,
      judgeTokenId: 'judge_b',
      judgeName: 'B',
      score: 5,
      isLocked: true,
      lockType: 'FORCED'
    });
  });

  test('includes the buzzing judge even without a panel entry or score row', async () => {
    const { service } = buildService({ votingJudges: [], existingRows: [] });

    const result = await service.activateGoldenBuzzer('cup-1', 42, 'judge_a', 'Judge A');

    expect(result.created).toBe(1);
    const createArgs = service.db.judgeScore.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({ judgeTokenId: 'judge_a', score: 5 });
  });

  test('records the buzzer in QueueService after the DB override', async () => {
    const { service, queueService } = buildService({
      votingJudges: [{ id: 'judge_a', name: 'A', kind: 'token' }]
    });

    await service.activateGoldenBuzzer('cup-1', 42, 'judge_a', 'Judge A');

    expect(queueService.assertGoldenBuzzerAllowed).toHaveBeenCalledWith(42, 'judge_a');
    expect(queueService.recordGoldenBuzzer).toHaveBeenCalledWith(42, 'judge_a', 'Judge A');
  });

  test('propagates the once-per-stream rejection without touching the DB', async () => {
    const { service, queueService } = buildService();
    queueService.assertGoldenBuzzerAllowed.mockImplementation(() => {
      throw new Error('You already used your golden buzzer this stream');
    });

    await expect(service.activateGoldenBuzzer('cup-1', 42, 'judge_a'))
      .rejects.toThrow('already used your golden buzzer');
    expect(service.db.judgeScore.updateMany).not.toHaveBeenCalled();
  });
});

describe('JudgeService.submitScore golden buzzer guard', () => {
  test('rejects score changes for a golden-buzzered item', async () => {
    const { service, queueService } = buildService();
    queueService.votingState = {
      queueItemId: 42,
      goldenBuzzer: { judgeId: 'judge_a', at: new Date().toISOString() }
    };

    await expect(service.submitScore('cup-1', 42, 'judge_b', 3))
      .rejects.toThrow('golden buzzer has locked in');
  });
});
