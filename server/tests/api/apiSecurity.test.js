const os = require('os');
const fs = require('fs');
const path = require('path');

// Point uploads at a temp dir BEFORE the api module (and its multer configs) loads
const TEST_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yq-test-uploads-'));
process.env.UPLOADS_DIR = TEST_UPLOADS_DIR;

jest.mock('../../src/database/connection', () => ({
  getDatabase: jest.fn(() => ({
    judgeSession: {
      findUnique: jest.fn().mockResolvedValue(null)
    }
  }))
}));

const express = require('express');
const request = require('supertest');
const apiRouter = require('../../src/api');
const { generateJudgeToken } = require('../../src/auth/judgeToken');

const STORED_ITEMS = [
  { id: 'item-1', name: 'Airhorn', url: '/uploads/mychan/sound-1.mp3', filename: 'sound-1.mp3' }
];

const createQueueService = () => ({
  getSetting: jest.fn(async (key, fallback) => {
    if (key === 'soundboard_items') return JSON.stringify(STORED_ITEMS);
    return fallback;
  }),
  updateSetting: jest.fn().mockResolvedValue(undefined),
  io: {
    emit: jest.fn(),
    fetchSockets: jest.fn().mockResolvedValue([])
  }
});

const createApp = ({ authenticated = true } = {}) => {
  const app = express();
  app.use(express.json());

  if (authenticated) {
    app.use((req, res, next) => {
      req.isAuthenticated = () => true;
      req.user = {
        id: 'user-1',
        username: 'owner',
        channels: [{ id: 'mychan', roles: ['OWNER'], ownershipRole: 'OWNER' }]
      };
      next();
    });
  }

  const queueService = createQueueService();
  const channelManager = {
    getQueueService: jest.fn(() => queueService),
    getUserChannels: jest.fn().mockResolvedValue(['mychan']),
    prisma: {}
  };

  app.set('channelManager', channelManager);
  app.use('/api', apiRouter);

  return { app, channelManager, queueService };
};

afterAll(() => {
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
});

describe('Soundboard play URL validation (authenticated route)', () => {
  test('accepts a stored itemId', async () => {
    const { app, queueService } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({ itemId: 'item-1' });

    expect(res.status).toBe(200);
    expect(queueService.io.emit).toHaveBeenCalledWith('soundboard:play', {
      id: 'item-1',
      name: 'Airhorn',
      url: '/uploads/mychan/sound-1.mp3'
    });
  });

  test('accepts a same-origin /uploads/ relative path', async () => {
    const { app, queueService } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({ url: '/uploads/mychan/sound-other.mp3' });

    expect(res.status).toBe(200);
    expect(queueService.io.emit).toHaveBeenCalledWith('soundboard:play', expect.objectContaining({
      url: '/uploads/mychan/sound-other.mp3'
    }));
  });

  test('accepts a URL matching a stored soundboard item', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({ url: '/uploads/mychan/sound-1.mp3' });

    expect(res.status).toBe(200);
  });

  test('rejects external URLs', async () => {
    const { app, queueService } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({ url: 'https://evil.example.com/rickroll.mp3' });

    expect(res.status).toBe(400);
    expect(queueService.io.emit).not.toHaveBeenCalled();
  });

  test('rejects protocol-relative URLs', async () => {
    const { app, queueService } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({ url: '//evil.example.com/x.mp3' });

    expect(res.status).toBe(400);
    expect(queueService.io.emit).not.toHaveBeenCalled();
  });

  test('rejects path traversal in /uploads/ paths', async () => {
    const { app, queueService } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({ url: '/uploads/mychan/../../etc/passwd' });

    expect(res.status).toBe(400);
    expect(queueService.io.emit).not.toHaveBeenCalled();
  });

  test('returns 400 when neither itemId nor url is provided', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/play')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('Soundboard play URL validation (judge-token route)', () => {
  const token = generateJudgeToken({ channelId: 'mychan', cupId: 'cup-1', judgeName: 'Judy' });

  test('accepts a stored itemId', async () => {
    const { app, queueService } = createApp({ authenticated: false });
    const res = await request(app)
      .post(`/api/channels/mychan/cups/cup-1/soundboard/play?token=${token}`)
      .send({ itemId: 'item-1' });

    expect(res.status).toBe(200);
    expect(queueService.io.emit).toHaveBeenCalledWith('soundboard:play', {
      id: 'item-1',
      name: 'Airhorn',
      url: '/uploads/mychan/sound-1.mp3'
    });
  });

  test('rejects external URLs', async () => {
    const { app, queueService } = createApp({ authenticated: false });
    const res = await request(app)
      .post(`/api/channels/mychan/cups/cup-1/soundboard/play?token=${token}`)
      .send({ url: 'http://evil.example.com/x.mp3' });

    expect(res.status).toBe(400);
    expect(queueService.io.emit).not.toHaveBeenCalled();
  });

  test('accepts same-origin /uploads/ paths', async () => {
    const { app } = createApp({ authenticated: false });
    const res = await request(app)
      .post(`/api/channels/mychan/cups/cup-1/soundboard/play?token=${token}`)
      .send({ url: '/uploads/mychan/sound-1.mp3' });

    expect(res.status).toBe(200);
  });
});

describe('Audio upload extension whitelist', () => {
  test('rejects a .html file disguised with an audio mimetype', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/upload')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.html',
        contentType: 'audio/mpeg'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/audio files/i);
  });

  test('rejects a whitelisted extension with a non-audio mimetype', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/upload')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.mp3',
        contentType: 'text/html'
      });

    expect(res.status).toBe(400);
  });

  test('rejects a file with no extension', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/upload')
      .attach('file', Buffer.from('abc'), {
        filename: 'noextension',
        contentType: 'audio/mpeg'
      });

    expect(res.status).toBe(400);
  });

  test('accepts a valid audio upload and stores whitelisted extension', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/soundboard/upload')
      .attach('file', Buffer.from('fake-mp3-bytes'), {
        filename: 'horn.mp3',
        contentType: 'audio/mpeg'
      });

    expect(res.status).toBe(201);
    expect(res.body.item.filename).toMatch(/^sound-.*\.mp3$/);
    expect(res.body.item.url).toMatch(/^\/uploads\/mychan\/sound-.*\.mp3$/);
  });

  test('shuffle upload rejects disguised extension too', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/uploads/shuffle-audio')
      .attach('file', Buffer.from('<svg onload=alert(1)>'), {
        filename: 'evil.svg',
        contentType: 'audio/mpeg'
      });

    expect(res.status).toBe(400);
  });

  test('shuffle upload accepts a valid audio file', async () => {
    const { app } = createApp();
    const res = await request(app)
      .post('/api/channels/mychan/uploads/shuffle-audio')
      .attach('file', Buffer.from('fake-ogg-bytes'), {
        filename: 'shuffle.ogg',
        contentType: 'audio/ogg'
      });

    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/^shuffle-.*\.ogg$/);
  });
});

describe('Auth on bot/status and video/validate', () => {
  test('GET /api/bot/status returns 401 when unauthenticated', async () => {
    const { app } = createApp({ authenticated: false });
    const res = await request(app).get('/api/bot/status');
    expect(res.status).toBe(401);
  });

  test('GET /api/bot/status works when authenticated', async () => {
    const { app } = createApp();
    app.set('bot', { getStats: () => ({ connected: true, channels: 1 }) });
    const res = await request(app).get('/api/bot/status');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
  });

  test('POST /api/video/validate returns 401 when unauthenticated', async () => {
    const { app } = createApp({ authenticated: false });
    const res = await request(app)
      .post('/api/video/validate')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(401);
  });

  test('POST /api/video/validate works when authenticated', async () => {
    const { app } = createApp();
    app.set('videoService', {
      isValidVideoUrl: () => true,
      getVideoMetadata: async () => ({ title: 'Test', duration: 60 })
    });
    const res = await request(app)
      .post('/api/video/validate')
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });
});
