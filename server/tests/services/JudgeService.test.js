const JudgeService = require('../../src/services/JudgeService');

const createService = ({ dbOverrides = {}, queueService = null } = {}) => {
  const io = { emit: jest.fn() };
  const svc = new JudgeService(io, 'test_channel');
  const db = {
    judgeSession: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn()
    },
    judgeScore: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    },
    channelRoleAssignment: {
      findMany: jest.fn()
    },
    account: {
      findUnique: jest.fn()
    },
    ...dbOverrides
  };
  svc.db = db;
  if (queueService) {
    svc.bindQueueService(queueService);
  }
  return { svc, io, db };
};

describe('JudgeService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('submitScore creates a new score when none exists', async () => {
    const queueService = { handleJudgeScoreEvent: jest.fn() };
    const { svc, io, db } = createService({ queueService });
    db.judgeScore.findUnique.mockResolvedValue(null);
    db.judgeScore.create.mockResolvedValue({
      id: 1,
      cupId: 'cup1',
      queueItemId: 10,
      judgeTokenId: 'judge_abc',
      score: 4.12345,
      comment: 'Nice'
    });

    const result = await svc.submitScore('cup1', 10, 'judge_abc', 4.12345, 'Nice', 'Alice');

    expect(db.judgeScore.create).toHaveBeenCalledWith({
      data: {
        cupId: 'cup1',
        queueItemId: 10,
        judgeTokenId: 'judge_abc',
        judgeName: 'Alice',
        score: 4.12345,
        comment: 'Nice'
      },
      include: expect.any(Object)
    });
    expect(io.emit).toHaveBeenCalledWith('judge:score_updated', { judgeScore: expect.any(Object) });
    expect(queueService.handleJudgeScoreEvent).toHaveBeenCalledWith('score_updated', { judgeScore: expect.any(Object) });
    expect(result.score).toBe(4.12345);
  });

  test('submitScore rejects when existing score is locked', async () => {
    const { svc, db } = createService();
    db.judgeScore.findUnique.mockResolvedValue({ isLocked: true });

    await expect(
      svc.submitScore('cup1', 10, 'judge_abc', 4.5)
    ).rejects.toThrow(/locked/i);
    expect(db.judgeScore.create).not.toHaveBeenCalled();
  });

  test('lockVote sets manual lock fields', async () => {
    const queueService = { handleJudgeScoreEvent: jest.fn() };
    const { svc, io, db } = createService({ queueService });
    db.judgeScore.update.mockResolvedValue({ id: 1, isLocked: true, lockType: 'MANUAL' });

    const res = await svc.lockVote('cup1', 10, 'judge_abc');

    expect(db.judgeScore.update).toHaveBeenCalledWith({
      where: { cupId_queueItemId_judgeTokenId: { cupId: 'cup1', queueItemId: 10, judgeTokenId: 'judge_abc' } },
      data: expect.objectContaining({ isLocked: true, lockType: 'MANUAL' }),
      include: expect.any(Object)
    });
    expect(io.emit).toHaveBeenCalledWith('judge:vote_locked', { judgeScore: expect.any(Object) });
    expect(queueService.handleJudgeScoreEvent).toHaveBeenCalledWith('vote_locked', { judgeScore: expect.any(Object) });
    expect(res.isLocked).toBe(true);
  });

  test('unlockVote rejects forced locks', async () => {
    const { svc, db } = createService();
    db.judgeScore.findUnique.mockResolvedValue({ lockType: 'FORCED' });

    await expect(
      svc.unlockVote('cup1', 10, 'judge_abc')
    ).rejects.toThrow(/forced/i);
    expect(db.judgeScore.update).not.toHaveBeenCalled();
  });

  test('unlockVote clears manual lock fields', async () => {
    const queueService = { handleJudgeScoreEvent: jest.fn() };
    const { svc, io, db } = createService({ queueService });
    db.judgeScore.findUnique.mockResolvedValue({ lockType: 'MANUAL' });
    db.judgeScore.update.mockResolvedValue({ isLocked: false, lockType: null, lockedAt: null });

    const res = await svc.unlockVote('cup1', 10, 'judge_abc');

    expect(db.judgeScore.update).toHaveBeenCalledWith({
      where: { cupId_queueItemId_judgeTokenId: { cupId: 'cup1', queueItemId: 10, judgeTokenId: 'judge_abc' } },
      data: { isLocked: false, lockType: null, lockedAt: null },
      include: expect.any(Object)
    });
    expect(io.emit).toHaveBeenCalledWith('judge:vote_unlocked', { judgeScore: expect.any(Object) });
    expect(queueService.handleJudgeScoreEvent).toHaveBeenCalledWith('vote_unlocked', { judgeScore: expect.any(Object) });
    expect(res.isLocked).toBe(false);
  });

  test('forceLockAllVotes locks unlocked votes and emits', async () => {
    const queueService = { handleJudgeScoreEvent: jest.fn() };
    const { svc, io, db } = createService({ queueService });
    db.judgeScore.updateMany.mockResolvedValue({ count: 2 });

    const res = await svc.forceLockAllVotes('cup1', 10);

    expect(db.judgeScore.updateMany).toHaveBeenCalledWith({
      where: { cupId: 'cup1', queueItemId: 10, isLocked: false },
      data: { isLocked: true, lockType: 'FORCED', lockedAt: expect.any(Date) }
    });
    expect(io.emit).toHaveBeenCalledWith('judge:all_votes_locked', { cupId: 'cup1', queueItemId: 10, count: 2 });
    expect(queueService.handleJudgeScoreEvent).toHaveBeenCalledWith('all_votes_locked', { cupId: 'cup1', queueItemId: 10, count: 2 });
    expect(res.count).toBe(2);
  });

  test('calculateAverageScore rounds to 5 decimals', async () => {
    const { svc, db } = createService();
    db.judgeScore.findMany.mockResolvedValue([{ score: 3.33333 }, { score: 4 }]);

    const res = await svc.calculateAverageScore('cup1', 10);

    expect(res.count).toBe(2);
    expect(res.total).toBe(7.33333);
    expect(res.average).toBe(3.66667);
  });

  test('calculateAverageScore returns null average when no scores', async () => {
    const { svc, db } = createService();
    db.judgeScore.findMany.mockResolvedValue([]);

    const res = await svc.calculateAverageScore('cup1', 10);

    expect(res).toEqual({ average: null, count: 0, total: 0 });
  });
});
