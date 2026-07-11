process.env.NODE_ENV = 'test';
process.env.JUDGE_TOKEN_SECRET = process.env.JUDGE_TOKEN_SECRET || 'test-secret';
process.env.ADMIN_TWITCH_IDS = process.env.ADMIN_TWITCH_IDS || '77292575';

// Silence logger during tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  stream: { write: jest.fn() }
}));

afterEach(() => {
  jest.clearAllMocks();
});
