/**
 * Integration test for judge scoring and locking using the real Prisma schema.
 * Requires TEST_DATABASE_URL (or DATABASE_URL) to point to a Postgres schema that has been migrated.
 * If no DB URL is provided, the suite is skipped.
 */
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const JudgeService = require('../../src/services/JudgeService');
const { createPrismaClient, resetDatabase, seedBasicCup, ensureTestSchema } = require('./helpers/db');

const hasDb = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('JudgeService integration (DB)', () => {
  let prisma;
  let seed;
  let service;
  let io;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    await ensureTestSchema(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    seed = await seedBasicCup(prisma);
    io = { emit: jest.fn() };
    service = new JudgeService(io, seed.channel.id);
    service.db = prisma;
  });

  test('submit -> lock -> average persists correctly', async () => {
    await service.createSession(seed.cup.id, seed.judgeId, 'Judge One');
    const submitted = await service.submitScore(
      seed.cup.id,
      seed.queueItems[0].id,
      seed.judgeId,
      3.14159,
      'Great',
      'Judge One'
    );

    expect(Number(submitted.score)).toBeCloseTo(3.14159);
    expect(await prisma.judgeScore.count({ where: { cupId: seed.cup.id } })).toBe(1);

    const locked = await service.lockVote(seed.cup.id, seed.queueItems[0].id, seed.judgeId);
    expect(locked.isLocked).toBe(true);
    expect(locked.lockType).toBe('MANUAL');

    const avg = await service.calculateAverageScore(seed.cup.id, seed.queueItems[0].id);
    expect(avg.count).toBe(1);
    expect(avg.average).toBe(3.14159);

    expect(io.emit).toHaveBeenCalledWith('judge:score_updated', expect.any(Object));
    expect(io.emit).toHaveBeenCalledWith('judge:vote_locked', expect.any(Object));
  });

  test('force lock then unlock forced votes', async () => {
    await service.createSession(seed.cup.id, seed.judgeId, 'Judge One');
    await service.submitScore(seed.cup.id, seed.queueItems[0].id, seed.judgeId, 4.5, null, 'Judge One');

    const forced = await service.forceLockAllVotes(seed.cup.id, seed.queueItems[0].id);
    expect(forced.count).toBe(1);

    const unlocked = await service.unlockAllForcedVotes(seed.cup.id, seed.queueItems[0].id);
    expect(unlocked.count).toBe(1);
  });
});
