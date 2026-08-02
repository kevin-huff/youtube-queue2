/**
 * Integration tests for the socket event authorization gate in src/socket/index.js.
 *
 * Boots a real socket.io server with the production socket handler and a
 * mocked ChannelManager, then connects real socket.io clients. Passport
 * session auth is simulated with an engine-level middleware that maps an
 * `x-test-user` handshake header to a user payload (mirroring how
 * src/index.js wires express-session/passport into io.engine).
 */
const { createServer } = require('http');
const { Server } = require('socket.io');
const ioc = require('socket.io-client');

const socketHandler = require('../../src/socket');
const { generateJudgeToken } = require('../../src/auth/judgeToken');

const CHANNEL = 'testchannel';

const TEST_USERS = {
  owner: {
    id: 'acct-owner',
    username: 'streamer',
    channels: [{ id: CHANNEL, ownershipRole: 'OWNER', roles: ['OWNER'] }]
  },
  producer: {
    id: 'acct-producer',
    username: 'producer_pal',
    channels: [{ id: CHANNEL, ownershipRole: null, roles: ['PRODUCER'] }]
  },
  host: {
    id: 'acct-host',
    username: 'show_host',
    channels: [{ id: CHANNEL, ownershipRole: null, roles: ['HOST'] }]
  },
  moderator: {
    id: 'acct-moderator',
    username: 'chat_mod',
    channels: [{ id: CHANNEL, ownershipRole: null, roles: ['MODERATOR'] }]
  },
  rando: {
    id: 'acct-rando',
    username: 'random_viewer',
    channels: []
  }
};

// Authoritative DB view returned by ChannelManager.getUserChannels
const DB_ROLES = {
  'acct-owner': [{ channelId: CHANNEL, ownershipRole: 'OWNER', roles: ['OWNER'] }],
  'acct-producer': [{ channelId: CHANNEL, ownershipRole: null, roles: ['PRODUCER'] }],
  'acct-host': [{ channelId: CHANNEL, ownershipRole: null, roles: ['HOST'] }],
  'acct-moderator': [{ channelId: CHANNEL, ownershipRole: null, roles: ['MODERATOR'] }],
  'acct-rando': []
};

describe('socket authorization gate', () => {
  let httpServer;
  let io;
  let port;
  let queueService;
  let clients;

  const makeQueueService = () => ({
    getCurrentQueue: jest.fn(async () => []),
    isQueueEnabled: jest.fn(async () => true),
    _getVipList: jest.fn(async () => []),
    getSetting: jest.fn(async (_key, fallback) => fallback),
    getVotingState: jest.fn(() => null),
    getGongState: jest.fn(() => null),
    getGoldenBuzzerState: jest.fn(() => ({ usedBy: [], active: null })),
    getQueueSize: jest.fn(async () => 0),
    currentlyPlaying: null,
    db: { cup: { findFirst: jest.fn(async () => null) } },
    removeFromQueue: jest.fn(async () => {}),
    reorderQueue: jest.fn(async () => {}),
    playNext: jest.fn(async () => {}),
    skipCurrent: jest.fn(async () => {}),
    replayPrevious: jest.fn(async () => {}),
    markAsPlayed: jest.fn(async () => {}),
    clearQueue: jest.fn(async () => {}),
    updateSetting: jest.fn(async () => {}),
    enableQueue: jest.fn(async () => {})
  });

  beforeAll((done) => {
    queueService = makeQueueService();

    const channelManager = {
      setNamespaceInitializer: jest.fn(),
      getAllChannels: jest.fn(() => [CHANNEL]),
      getChannelInfo: jest.fn(async () => null),
      getGlobalStats: jest.fn(async () => ({})),
      getQueueService: jest.fn((channelId) => (channelId === CHANNEL ? queueService : null)),
      getUserChannels: jest.fn(async (accountId) => DB_ROLES[accountId] || [])
    };

    httpServer = createServer();
    io = new Server(httpServer);

    // Simulate the passport/session engine middleware from src/index.js
    io.engine.use((req, res, next) => {
      const key = req.headers['x-test-user'];
      if (key && TEST_USERS[key]) {
        req.user = TEST_USERS[key];
      }
      next();
    });

    socketHandler(io, channelManager);

    httpServer.listen(0, () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close(() => {
      done();
    });
  });

  beforeEach(() => {
    clients = [];
  });

  afterEach(() => {
    clients.forEach((client) => client.close());
  });

  const connect = ({ userKey = null, judgeToken = null } = {}) =>
    new Promise((resolve, reject) => {
      const client = ioc(`http://localhost:${port}/channel/${CHANNEL}`, {
        transports: ['websocket'],
        forceNew: true,
        extraHeaders: userKey ? { 'x-test-user': userKey } : {},
        auth: judgeToken ? { judgeToken } : {}
      });
      clients.push(client);
      client.on('connect', () => resolve(client));
      client.on('connect_error', reject);
    });

  const waitForEvent = (client, event, timeoutMs = 2000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for "${event}"`)),
        timeoutMs
      );
      client.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const waitForCall = (mockFn, timeoutMs = 2000) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (mockFn.mock.calls.length > 0) {
          return resolve(mockFn.mock.calls);
        }
        if (Date.now() - started > timeoutMs) {
          return reject(new Error('Timed out waiting for mock call'));
        }
        return setTimeout(poll, 10);
      };
      poll();
    });

  it('denies admin events for unauthenticated sockets', async () => {
    const client = await connect();
    client.emit('queue:clear', {});
    const error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/Authentication required/i);
    expect(queueService.clearQueue).not.toHaveBeenCalled();
  });

  it('denies queue:replay_previous for unauthenticated sockets', async () => {
    const client = await connect();
    client.emit('queue:replay_previous', {});
    const error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/Authentication required/i);
    expect(queueService.replayPrevious).not.toHaveBeenCalled();
  });

  it('denies admin events for authenticated users without a role on the channel', async () => {
    const client = await connect({ userKey: 'rando' });
    client.emit('queue:clear', {});
    const error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.clearQueue).not.toHaveBeenCalled();
  });

  it('denies player events for authenticated users without a role on the channel', async () => {
    const client = await connect({ userKey: 'rando' });
    let echoed = false;
    client.on('player:play', () => {
      echoed = true;
    });
    client.emit('player:play', { time: 1 });
    const error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(echoed).toBe(false);
  });

  it('allows admin events for the channel owner', async () => {
    const client = await connect({ userKey: 'owner' });
    client.emit('queue:clear', { clearedBy: 'streamer' });
    await waitForCall(queueService.clearQueue);
    expect(queueService.clearQueue).toHaveBeenCalledWith('streamer');
  });

  it('allows admin events for a PRODUCER show-role holder', async () => {
    const client = await connect({ userKey: 'producer' });
    client.emit('queue:replay_previous', { initiatedBy: 'producer_pal' });
    await waitForCall(queueService.replayPrevious);
    expect(queueService.replayPrevious).toHaveBeenCalledWith('producer_pal');
  });

  it('allows player events for the channel owner', async () => {
    const client = await connect({ userKey: 'owner' });
    client.emit('player:play', { time: 5 });
    const payload = await waitForEvent(client, 'player:play');
    expect(payload).toEqual({ time: 5 });
  });

  it('allows playback events (player:pause, queue:skip) for a bare HOST', async () => {
    const client = await connect({ userKey: 'host' });

    client.emit('player:pause', { time: 7 });
    const payload = await waitForEvent(client, 'player:pause');
    expect(payload).toEqual({ time: 7 });

    client.emit('queue:skip', { skippedBy: 'show_host' });
    await waitForCall(queueService.skipCurrent);
    expect(queueService.skipCurrent).toHaveBeenCalledWith('show_host');
  });

  it('denies admin events (settings:update, queue:clear) for a bare HOST', async () => {
    const client = await connect({ userKey: 'host' });

    client.emit('settings:update', { key: 'max_queue_size', value: '10' });
    let error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.updateSetting).not.toHaveBeenCalled();

    client.emit('queue:clear', {});
    error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.clearQueue).not.toHaveBeenCalled();
  });

  it('allows moderation events (queue:remove) for a bare MODERATOR', async () => {
    const client = await connect({ userKey: 'moderator' });
    client.emit('queue:remove', { itemId: 42, removedBy: 'chat_mod' });
    await waitForCall(queueService.removeFromQueue);
    expect(queueService.removeFromQueue).toHaveBeenCalledWith(42, 'chat_mod');
  });

  it('denies admin and playback events for a bare MODERATOR', async () => {
    const client = await connect({ userKey: 'moderator' });

    client.emit('queue:clear', {});
    let error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.clearQueue).not.toHaveBeenCalled();

    client.emit('queue:skip', {});
    error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.skipCurrent).not.toHaveBeenCalled();
  });

  it('allows player events for judge-token sockets', async () => {
    const token = generateJudgeToken({
      channelId: CHANNEL,
      cupId: 'cup-1',
      judgeName: 'Judge Judy'
    });
    const client = await connect({ judgeToken: token });
    client.emit('player:pause', { time: 12 });
    const payload = await waitForEvent(client, 'player:pause');
    expect(payload).toEqual({ time: 12 });
  });

  it('denies everything except player events for judge-token sockets', async () => {
    const token = generateJudgeToken({
      channelId: CHANNEL,
      cupId: 'cup-1',
      judgeName: 'Judge Judy'
    });
    const client = await connect({ judgeToken: token });

    client.emit('queue:clear', {});
    let error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.clearQueue).not.toHaveBeenCalled();

    // Playback-category events (beyond player:*) are also denied for judges
    client.emit('queue:skip', {});
    error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.skipCurrent).not.toHaveBeenCalled();

    client.emit('queue:remove', { itemId: 1 });
    error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/not authorized/i);
    expect(queueService.removeFromQueue).not.toHaveBeenCalled();
  });

  it('rejects judge tokens scoped to a different channel', async () => {
    const token = generateJudgeToken({
      channelId: 'someotherchannel',
      cupId: 'cup-1',
      judgeName: 'Wrong Channel Judge'
    });
    const client = await connect({ judgeToken: token });
    client.emit('player:play', { time: 3 });
    const error = await waitForEvent(client, 'error');
    expect(error.message).toMatch(/Authentication required/i);
  });

  it('still allows anonymous overlay clients to read public state', async () => {
    const client = await connect();
    client.emit('queue:join');
    const state = await waitForEvent(client, 'queue:initial_state');
    expect(state).toHaveProperty('queue');
    expect(state).toHaveProperty('enabled', true);
  });
});
