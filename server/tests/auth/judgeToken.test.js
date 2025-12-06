const jwt = require('jsonwebtoken');

const mockFindUnique = jest.fn();
jest.mock('../../src/database/connection', () => ({
  getDatabase: jest.fn(() => ({
    judgeSession: {
      findUnique: mockFindUnique
    }
  })),
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn()
}));

const { generateJudgeToken, verifyJudgeToken, authenticateJudgeToken } = require('../../src/auth/judgeToken');

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

const createReq = ({ query = {}, headers = {}, params = {}, session = {} } = {}) => ({
  query,
  headers,
  params,
  session
});

describe('judgeToken helpers', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  test('generateJudgeToken + verifyJudgeToken round trip', () => {
    const token = generateJudgeToken({
      channelId: 'test_channel',
      cupId: 'cup_123',
      judgeName: 'Tester',
      expiresIn: '1h'
    });

    const decoded = verifyJudgeToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded.type).toBe('JUDGE');
    expect(decoded.channelId).toBe('test_channel');
    expect(decoded.cupId).toBe('cup_123');
    expect(decoded.judgeName).toBe('Tester');
    expect(decoded.judgeId).toBeTruthy();
  });

  test('verifyJudgeToken rejects non-judge token', () => {
    const bogus = jwt.sign({ type: 'USER' }, process.env.JUDGE_TOKEN_SECRET);
    expect(verifyJudgeToken(bogus)).toBeNull();
  });

  test('verifyJudgeToken rejects expired token', () => {
    jest.useFakeTimers();
    const token = jwt.sign(
      { type: 'JUDGE', judgeId: 'expired', channelId: 'chan', cupId: 'cup', judgeName: 'Old' },
      process.env.JUDGE_TOKEN_SECRET,
      { expiresIn: '1ms' }
    );

    jest.advanceTimersByTime(10);
    expect(verifyJudgeToken(token)).toBeNull();
    jest.useRealTimers();
  });
});

describe('authenticateJudgeToken middleware', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  test('returns 401 when no token provided', async () => {
    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    await authenticateJudgeToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects when session is not active', async () => {
    const token = generateJudgeToken({ channelId: 'chan', cupId: 'cup1', judgeName: 'Alice', expiresIn: '1h' });
    mockFindUnique.mockResolvedValue({ status: 'ENDED' });

    const req = createReq({
      query: { token },
      params: { channelId: 'chan', cupId: 'cup1' },
      session: {}
    });
    const res = createRes();
    const next = jest.fn();

    await authenticateJudgeToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toMatch(/revoked|inactive/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects when channel does not match token', async () => {
    const token = generateJudgeToken({ channelId: 'chan', cupId: 'cup1', judgeName: 'Alice', expiresIn: '1h' });
    mockFindUnique.mockResolvedValue(null);

    const req = createReq({
      query: { token },
      params: { channelId: 'other', cupId: 'cup1' },
      session: {}
    });
    const res = createRes();
    const next = jest.fn();

    await authenticateJudgeToken(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toMatch(/channel/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows bootstrap when session missing and sets judgeAuth', async () => {
    const token = generateJudgeToken({ channelId: 'chan', cupId: 'cup1', judgeName: 'Alice', expiresIn: '1h' });
    mockFindUnique.mockResolvedValue(null);

    const session = {};
    const req = createReq({
      query: { token },
      params: { channelId: 'chan', cupId: 'cup1' },
      session
    });
    const res = createRes();
    const next = jest.fn();

    await authenticateJudgeToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.judgeAuth).toMatchObject({
      judgeName: 'Alice',
      channelId: 'chan',
      cupId: 'cup1'
    });
    expect(session.judgeToken).toBe(token);
  });
});
