const express = require('express');
const passport = require('passport');
const { body, param, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const logger = require('../utils/logger');
const { requireAuth, requireChannelRole } = require('../auth/middleware');
const { authenticateJudgeToken, generateJudgeToken, verifyJudgeToken } = require('../auth/judgeToken');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  return next();
};

// File upload handling for per-channel assets (e.g., shuffle audio)
// Use env-configurable absolute dir for deployments with volumes (e.g., Railway)
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');
// Log the resolved uploads root once when this module loads
try {
  logger.info('Uploads root resolved', { env: process.env.UPLOADS_DIR || null, path: UPLOADS_ROOT });
} catch (_) {}
const ensureDir = (dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created uploads directory', { dir });
    }
  } catch (e) {
    logger.error('Failed to create uploads directory', { dir, error: e?.message });
  }
};
ensureDir(UPLOADS_ROOT);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const channelId = (req.params.channelId || 'default').toString().toLowerCase();
    const channelDir = path.join(UPLOADS_ROOT, channelId);
    ensureDir(channelDir);
    try {
      logger.info('Upload destination (shuffle)', {
        channelId,
        channelDir,
        uploadsRoot: UPLOADS_ROOT,
        route: req.originalUrl
      });
    } catch (_) {}
    cb(null, channelDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.mp3';
    const safeExt = ext.length <= 8 ? ext.toLowerCase() : '.mp3';
    const name = `shuffle-${Date.now()}${safeExt}`;
    try {
      logger.info('Assigned filename (shuffle)', { original: file.originalname, assigned: name, mime: file.mimetype });
    } catch (_) {}
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ok = (file.mimetype || '').startsWith('audio/');
    if (ok) return cb(null, true);
    const err = new Error('Only audio files are allowed');
    err.status = 400;
    return cb(err);
  }
});

// Separate storage for soundboard to distinguish filenames
const sbStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const channelId = (req.params.channelId || 'default').toString().toLowerCase();
    const channelDir = path.join(UPLOADS_ROOT, channelId);
    ensureDir(channelDir);
    try {
      logger.info('Upload destination (soundboard)', {
        channelId,
        channelDir,
        uploadsRoot: UPLOADS_ROOT,
        route: req.originalUrl
      });
    } catch (_) {}
    cb(null, channelDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.mp3';
    const safeExt = ext.length <= 8 ? ext.toLowerCase() : '.mp3';
    const name = `sound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    try {
      logger.info('Assigned filename (soundboard)', { original: file.originalname, assigned: name, mime: file.mimetype });
    } catch (_) {}
    cb(null, name);
  }
});

const sbUpload = multer({
  storage: sbStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = (file.mimetype || '').startsWith('audio/');
    if (ok) return cb(null, true);
    const err = new Error('Only audio files are allowed');
    err.status = 400;
    return cb(err);
  }
});

const getChannelManager = (req) => {
  const manager = req.app.get('channelManager');
  if (!manager) {
    throw Object.assign(new Error('Channel manager not available'), { status: 500 });
  }
  return manager;
};

const requireChannelOwnership = async (channelManager, accountId, channelId) => {
  const normalizedChannelId = channelId.toLowerCase();
  const owned = await channelManager.getUserChannels(accountId);
  if (!owned.includes(normalizedChannelId)) {
    throw Object.assign(new Error('Access denied to this channel'), { status: 403 });
  }
  return normalizedChannelId;
};

const getQueueServiceOrThrow = (channelManager, channelId, { requireActive = true } = {}) => {
  const queueService = channelManager.getQueueService(channelId);
  if (!queueService) {
    const error = new Error('Channel not found or inactive');
    error.status = requireActive ? 404 : 200;
    throw error;
  }
  return queueService;
};

const ensureOwnerOrManager = async (channelManager, accountId, channelId) => {
  const normalizedChannelId = await requireChannelOwnership(channelManager, accountId, channelId);
  const ownership = await channelManager.prisma.channelOwner.findUnique({
    where: {
      accountId_channelId: {
        accountId,
        channelId: normalizedChannelId
      }
    }
  });

  if (!ownership || !['OWNER', 'MANAGER'].includes(ownership.role)) {
    const error = new Error('Channel owner or manager access required');
    error.status = 403;
    throw error;
  }

  return normalizedChannelId;
};

// Require that the current user is the OWNER of the channel
const ensureOwnerOnly = async (channelManager, accountId, channelId) => {
  const normalizedChannelId = await requireChannelOwnership(channelManager, accountId, channelId);
  const ownership = await channelManager.prisma.channelOwner.findUnique({
    where: {
      accountId_channelId: {
        accountId,
        channelId: normalizedChannelId
      }
    }
  });

  if (!ownership || ownership.role !== 'OWNER') {
    const error = new Error('Channel owner access required');
    error.status = 403;
    throw error;
  }

  return normalizedChannelId;
};

const formatRoleAssignment = (assignment) => ({
  id: assignment.id,
  channelId: assignment.channelId,
  role: assignment.role,
  cupId: assignment.cupId,
  expiresAt: assignment.expiresAt,
  createdAt: assignment.createdAt,
  accountId: assignment.accountId,
  account: assignment.account
    ? {
        id: assignment.account.id,
        username: assignment.account.username,
        displayName: assignment.account.displayName,
        profileImageUrl: assignment.account.profileImageUrl
      }
    : null,
  cup: assignment.cup
    ? {
        id: assignment.cup.id,
        title: assignment.cup.title,
        slug: assignment.cup.slug,
        status: assignment.cup.status
      }
    : null
});

const formatChannelOwner = (owner) => ({
  id: owner.id,
  accountId: owner.accountId,
  role: owner.role,
  createdAt: owner.createdAt,
  account: owner.account
    ? {
        id: owner.account.id,
        username: owner.account.username,
        displayName: owner.account.displayName,
        profileImageUrl: owner.account.profileImageUrl
  }
  : null
});

const formatRoleInvite = (invite) => ({
  id: invite.id,
  channelId: invite.channelId,
  invitedUsername: invite.invitedUsername,
  role: invite.role,
  cupId: invite.cupId,
  note: invite.note || null,
  expiresAt: invite.expiresAt,
  acceptedAt: invite.acceptedAt,
  createdAt: invite.createdAt,
  assignedBy: invite.assignedBy,
  assignedByAccount: invite.assignedByAccount
    ? {
        id: invite.assignedByAccount.id,
        username: invite.assignedByAccount.username,
        displayName: invite.assignedByAccount.displayName,
        profileImageUrl: invite.assignedByAccount.profileImageUrl
      }
    : null,
  cup: invite.cup
    ? {
        id: invite.cup.id,
        title: invite.cup.title,
        slug: invite.cup.slug,
        status: invite.cup.status
      }
    : null
});

const SUBMITTER_FIELDS = {
  twitchUsername: true,
  role: true
};

// OAuth routes (conditionally enabled)
const TWITCH_AUTH_ENABLED = Boolean(
  process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET && process.env.TWITCH_REDIRECT_URI
);

if (TWITCH_AUTH_ENABLED) {
  router.get('/auth/twitch',
    passport.authenticate('twitch', {
      scope: [
        'user:read:email',
        'channel:read:subscriptions',
        // Needed for ad schedule + EventSub ad break subscriptions
        'channel:read:ads'
        // Optionally: 'channel:manage:ads' if you want to trigger commercials
      ]
    })
  );

  router.get('/auth/twitch/callback',
    passport.authenticate('twitch', { failureRedirect: '/login?error=auth_failed' }),
    async (req, res) => {
    try {
      const channelManager = req.app.get('channelManager');
      const bot = req.app.get('bot');
      const adService = req.app.get('adEventService');

      if (channelManager && req.user?.channels?.length) {
        for (const channel of req.user.channels) {
          const channelId = channel.id.toLowerCase();

          if (!channelManager.getChannelInstance(channelId)) {
            await channelManager.createChannelInstance(channelId);
          } else if (!channelManager.isChannelActive(channelId)) {
            await channelManager.activateChannel(channelId);
          }

          if (bot?.isConnected?.()) {
            await bot.joinChannel(channelId);
          }
        }
      }

      // Hint ad service to refresh subscriptions/polling now that we may have tokens
      try { if (adService?.refreshSubscriptions) await adService.refreshSubscriptions(); } catch (_) {}
    } catch (error) {
      logger.error('Post-auth channel initialization failed:', error);
    }

    const redirectUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const hasAnyChannel = Array.isArray(req.user?.channels) && req.user.channels.length > 0;
    const targetPath = hasAnyChannel ? '/dashboard' : '/onboarding';
    res.redirect(`${redirectUrl}${targetPath}`);
    }
  );
} else {
  router.get('/auth/twitch', (req, res) => {
    res.status(503).json({ error: 'Twitch OAuth is not configured on this deployment' });
  });
  router.get('/auth/twitch/callback', (req, res) => {
    res.redirect('/login?error=oauth_not_configured');
  });
}

router.get('/auth/user', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        email: req.user.email,
        profileImageUrl: req.user.profileImageUrl,
        channels: req.user.channels || []
      }
    });
  }

  return res.json({ authenticated: false });
});

router.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      logger.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    return res.json({ success: true });
  });
});

// Channel management
router.get('/channels', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const ownedIds = await channelManager.getUserChannels(req.user.id);
    const channels = [];

    for (const id of ownedIds) {
      const info = await channelManager.getChannelInfo(id);
      if (info) {
        channels.push(info);
      }
    }

    res.json({ channels });
  } catch (error) {
    logger.error('Error getting user channels:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get channels' });
  }
});

router.post('/channels', requireAuth, [
  body('name').notEmpty().withMessage('Channel name is required')
], validate, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const channelInfo = await channelManager.addChannel(req.body.name, req.user.id);

    if (!channelInfo) {
      return res.status(400).json({ error: 'Failed to add channel' });
    }

    const bot = req.app.get('bot');
    if (bot) {
      await bot.joinChannel(channelInfo.id);
    }

    res.status(201).json({ channel: channelInfo });
  } catch (error) {
    logger.error('Error adding channel:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to add channel' });
  }
});

router.delete('/channels/:channelId', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);

    await channelManager.removeChannel(normalizedChannelId, req.user.id);

    const bot = req.app.get('bot');
    if (bot) {
      await bot.leaveChannel(normalizedChannelId);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing channel:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to remove channel' });
  }
});

router.get('/channels/by-name/:channelName', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelName);
    const channel = await channelManager.getChannelInfo(normalizedChannelId);

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json({ channel });
  } catch (error) {
    logger.error('Error getting channel by name:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get channel' });
  }
});

router.get('/channels/public/:channelName', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = req.params.channelName.toLowerCase();
    const channel = await channelManager.getChannelInfo(normalizedChannelId);

    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    res.json({ channel });
  } catch (error) {
    logger.error('Error getting public channel info:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get channel' });
  }
});

router.get('/channels/public/:channelName/queue', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = req.params.channelName.toLowerCase();
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const queue = await queueService.getCurrentQueue();
    res.json({
      channelId: normalizedChannelId,
      queue,
      currentlyPlaying: queueService.currentlyPlaying
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    logger.error('Error getting public queue:', error);
    res.status(500).json({ error: 'Failed to get queue' });
  }
});

// Public VIP list for a channel
router.get('/channels/public/:channelName/vip', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = req.params.channelName.toLowerCase();
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const vipQueue = await queueService._getVipList();
    res.json({
      channelId: normalizedChannelId,
      vipQueue
    });
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    logger.error('Error getting public VIP list:', error);
    res.status(500).json({ error: 'Failed to get VIP list' });
  }
});

// Get list of cups for a channel (public)
router.get('/channels/public/:channelName/cups', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = req.params.channelName.toLowerCase();

    const channel = await channelManager.getChannelInfo(normalizedChannelId);
    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Only show LIVE and COMPLETED cups publicly
    const cups = await channelManager.prisma.cup.findMany({
      where: {
        channelId: normalizedChannelId,
        status: {
          in: ['LIVE', 'COMPLETED']
        }
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        title: true,
        slug: true,
        theme: true,
        status: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        _count: {
          select: {
            queueItems: {
              where: {
                status: 'SCORED'
              }
            }
          }
        }
      }
    });

    res.json({ cups });
  } catch (error) {
    logger.error('Error getting public cups:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get cups' });
  }
});

// Get current/active cup for a channel (public)
router.get('/channels/public/:channelName/cups/current', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = req.params.channelName.toLowerCase();

    const channel = await channelManager.getChannelInfo(normalizedChannelId);
    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const currentCup = await channelManager.prisma.cup.findFirst({
      where: {
        channelId: normalizedChannelId,
        isActive: true
      },
      select: {
        id: true,
        title: true,
        slug: true,
        theme: true,
        status: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        _count: {
          select: {
            queueItems: {
              where: {
                status: 'SCORED'
              }
            }
          }
        }
      }
    });

    if (!currentCup) {
      return res.status(404).json({ error: 'No active cup found' });
    }

    res.json({ cup: currentCup });
  } catch (error) {
    logger.error('Error getting current cup:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get current cup' });
  }
});

router.get('/channels/public/:channelName/cups/:cupId/standings', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = req.params.channelName.toLowerCase();
    const cupId = req.params.cupId;

    const channel = await channelManager.getChannelInfo(normalizedChannelId);
    if (!channel || !channel.isActive) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const cupRecord = await channelManager.prisma.cup.findFirst({
      where: {
        id: cupId,
        channelId: normalizedChannelId
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!cupRecord) {
      return res.status(404).json({ error: 'Cup not found' });
    }

    const { standings, videos, cup } = await channelManager.rebuildCupStandings(normalizedChannelId, cupId);
      const enrichedStandings = standings.map((entry) => ({
        ...entry,
        submitterAlias: entry.submitterAlias || null,
        publicSubmitterName:
          entry.publicSubmitterName || entry.submitterAlias || entry.submitterUsername || null
      }));
      const enrichedVideos = videos.map((video) => ({
        ...video,
        submitterAlias: video.submitterAlias || null,
        publicSubmitterName:
          video.publicSubmitterName ||
          video.submitterAlias ||
          video.submitter?.twitchUsername ||
          null
      }));

    res.json({
      standings: enrichedStandings,
      videos: enrichedVideos,
      cup
    });
  } catch (error) {
    logger.error('Error getting public cup standings:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get standings' });
  }
});

// Public: Submitter profile across all channels and cups
// Returns all rated videos (with judge scores) grouped by cup
router.get('/public/submitters/:username', async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const prisma = channelManager.prisma;

    const usernameParam = (req.params.username || '').toString().trim();
    if (!usernameParam) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Find all items for this submitter that have any judge scores (i.e., have been rated)
    const items = await prisma.queueItem.findMany({
      where: {
        submitterUsername: { equals: usernameParam, mode: 'insensitive' },
        judgeScores: { some: {} }
      },
      include: {
        judgeScores: true,
        cup: {
          select: { id: true, title: true, slug: true, status: true, channelId: true }
        },
        channel: {
          select: { id: true, displayName: true, profileImageUrl: true }
        }
      },
      orderBy: [
        { playedAt: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    if (!items.length) {
      return res.json({
        submitter: { username: usernameParam },
        cups: [],
        stats: { totalVideos: 0, totalJudgeCount: 0 }
      });
    }

    // Prepare cup baselines (mean score per cup) for social score calculation
    const cupIdSet = new Set(items.filter((i) => i.cup).map((i) => i.cup.id));
    const cupIdsForBaseline = Array.from(cupIdSet.values());
    const DEFAULT_SOCIAL_MIN_VOTES = 3;
    const DEFAULT_SOCIAL_GLOBAL_MEAN = 3.4;
    let cupBaselines = new Map();
    if (cupIdsForBaseline.length > 0) {
      try {
        const grouped = await prisma.judgeScore.groupBy({
          by: ['cupId'],
          where: { cupId: { in: cupIdsForBaseline } },
          _avg: { score: true },
          _count: { score: true }
        });
        cupBaselines = new Map(
          grouped.map((g) => [g.cupId, {
            meanScore: Number((g._avg?.score ?? DEFAULT_SOCIAL_GLOBAL_MEAN).toFixed(5)),
            totalVotes: g._count?.score ?? 0
          }])
        );
      } catch (_) {
        cupBaselines = new Map();
      }
    }

    // Group items by cup
    const byCup = new Map();
    for (const item of items) {
      if (!item.cup) {
        // Skip items not assigned to a cup for this view
        continue;
      }
      const cupKey = item.cup.id;
      if (!byCup.has(cupKey)) {
        byCup.set(cupKey, {
          cup: item.cup,
          channel: item.channel || { id: item.cup.channelId, displayName: item.cup.channelId, profileImageUrl: null },
          videos: [],
          stats: { videoCount: 0, judgeCount: 0 }
        });
      }

      const judgeScores = Array.isArray(item.judgeScores) ? item.judgeScores : [];
      const judgeCount = judgeScores.length;
      let totalScore = null;
      let averageScore = null;
      if (judgeCount > 0) {
        const sum = judgeScores.reduce((s, x) => s + Number(x.score), 0);
        totalScore = Number(sum.toFixed(5));
        averageScore = Number((sum / judgeCount).toFixed(5));
      }

      // Compute social score using cup baseline
      let socialScore = null;
      if (judgeCount > 0 && typeof averageScore === 'number') {
        const baseline = cupBaselines.get(item.cup.id) || { meanScore: DEFAULT_SOCIAL_GLOBAL_MEAN };
        const m = DEFAULT_SOCIAL_MIN_VOTES;
        const v = judgeCount;
        const C = typeof baseline.meanScore === 'number' ? baseline.meanScore : DEFAULT_SOCIAL_GLOBAL_MEAN;
        const divisor = v + m;
        if (divisor > 0) {
          const weighted = ((v / divisor) * averageScore) + ((m / divisor) * C);
          socialScore = Number(weighted.toFixed(5));
        }
      }

      const videoPayload = {
        queueItemId: item.id,
        videoId: item.videoId,
        videoUrl: item.videoUrl,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        status: item.status,
        playedAt: item.playedAt,
        createdAt: item.createdAt,
        judgeCount,
        totalScore,
        averageScore,
        socialScore,
        judgeScores: judgeScores.map((score) => ({
          id: score.id,
          score: Number(score.score),
          comment: score.comment || null,
          isLocked: score.isLocked,
          lockType: score.lockType || null,
          lockedAt: score.lockedAt || null,
          judgeName: score.judgeName || 'Anonymous'
        }))
      };

      const entry = byCup.get(cupKey);
      entry.videos.push(videoPayload);
      entry.stats.videoCount += 1;
      entry.stats.judgeCount += judgeCount;
    }

    // Fetch standings summaries for this submitter for the cups we found
    const cupIds = Array.from(byCup.keys());
    const standings = await prisma.cupStanding.findMany({
      where: {
        cupId: { in: cupIds },
        submitterUsername: { equals: usernameParam, mode: 'insensitive' }
      },
      select: {
        cupId: true,
        averageScore: true,
        totalScore: true,
        judgeCount: true,
        rank: true,
        metadata: true
      }
    });
    const standingByCup = new Map(standings.map((s) => [s.cupId, s]));

    const cups = Array.from(byCup.values()).map((group) => ({
      cup: group.cup,
      channel: group.channel,
      stats: {
        videoCount: group.stats.videoCount,
        judgeCount: group.stats.judgeCount
      },
      standing: standingByCup.get(group.cup.id) || null,
      videos: group.videos
    }));

    const totals = cups.reduce((acc, c) => ({
      totalVideos: acc.totalVideos + (c?.stats?.videoCount || 0),
      totalJudgeCount: acc.totalJudgeCount + (c?.stats?.judgeCount || 0)
    }), { totalVideos: 0, totalJudgeCount: 0 });

    res.json({
      submitter: { username: usernameParam },
      cups,
      stats: totals
    });
  } catch (error) {
    logger.error('Error getting public submitter profile:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get submitter profile' });
  }
});

// Cup management routes
router.post('/channels/:channelId/cups',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER']),
  [
    body('title').notEmpty().withMessage('Cup title is required'),
    body('slug').notEmpty().withMessage('Cup slug is required')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const { db } = channelManager;

      const cup = await channelManager.prisma.cup.create({
        data: {
          channelId: normalizedChannelId,
          title: req.body.title,
          slug: req.body.slug,
          theme: req.body.theme || null,
          status: req.body.status || 'DRAFT',
          seriesId: req.body.seriesId || null,
          metadata: req.body.metadata || {}
        }
      });

      logger.info(`Cup created: ${cup.title} (${cup.id})`);
      res.status(201).json({ cup });
    } catch (error) {
      logger.error('Error creating cup:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to create cup' });
    }
  }
);

router.get('/channels/:channelId/cups',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);

      const cups = await channelManager.prisma.cup.findMany({
        where: { channelId: normalizedChannelId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              queueItems: true,
              judgeScores: true
            }
          }
        }
      });

      res.json({ cups });
    } catch (error) {
      logger.error('Error getting cups:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get cups' });
    }
  }
);

// Set cup as active (only one active cup per channel)
router.patch('/channels/:channelId/cups/:cupId/set-active',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const { cupId } = req.params;

      // First, deactivate all cups for this channel
      await channelManager.prisma.cup.updateMany({
        where: { channelId: normalizedChannelId },
        data: { isActive: false }
      });

      // Then activate this specific cup
      const cup = await channelManager.prisma.cup.update({
        where: { 
          id: cupId,
          channelId: normalizedChannelId 
        },
        data: { isActive: true }
      });

      logger.info(`Cup ${cupId} set as active for channel ${normalizedChannelId}`);
      res.json({ cup });
    } catch (error) {
      logger.error('Error setting active cup:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to set active cup' });
    }
  }
);

// Get videos for a specific cup
router.get('/channels/:channelId/cups/:cupId/videos',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const { cupId } = req.params;

      // Get videos assigned to this cup
      const videos = await channelManager.prisma.queueItem.findMany({
        where: {
          channelId: normalizedChannelId,
          cupId
        },
        include: {
          submitter: {
            select: SUBMITTER_FIELDS
          },
          judgeScores: {
            include: {
              judgeSession: {
                select: {
                  judgeName: true
                }
              }
            }
          }
        },
        orderBy: [
          { playedAt: 'asc' },
          { position: 'asc' }
        ]
      });

      const enrichedVideos = videos.map((video) => ({
        ...video,
        submitterAlias: video.submitterAlias || null,
        publicSubmitterName: video.submitterAlias || video.submitter?.twitchUsername || null
      }));

      res.json({ videos: enrichedVideos });
    } catch (error) {
      logger.error('Error getting cup videos:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get cup videos' });
    }
  }
);

// Unassign video from cup
router.patch('/channels/:channelId/cups/:cupId/videos/:videoId/unassign',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const { cupId, videoId } = req.params;

      // Unassign the video from the cup
      const video = await channelManager.prisma.queueItem.update({
        where: {
          id: videoId,
          channelId: normalizedChannelId,
          cupId
        },
        data: {
          cupId: null
        }
      });

      logger.info(`Video ${videoId} unassigned from cup ${cupId}`);
      res.json({ video });
    } catch (error) {
      logger.error('Error unassigning video from cup:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to unassign video from cup' });
    }
  }
);

// Generate judge link for a cup
router.post('/channels/:channelId/cups/:cupId/judge-link',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  [
    body('judgeName').optional().isString().withMessage('Judge name must be a string'),
    body('expiresIn').optional().isString().withMessage('expiresIn must be a string (e.g., "7d", "24h")')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const cupId = req.params.cupId;

      // Verify cup exists and belongs to this channel
      const cup = await channelManager.prisma.cup.findFirst({
        where: {
          id: cupId,
          channelId: normalizedChannelId
        }
      });

      if (!cup) {
        return res.status(404).json({ error: 'Cup not found' });
      }

      // Generate the judge token
      const token = generateJudgeToken({
        channelId: normalizedChannelId,
        cupId: cupId,
        judgeName: req.body.judgeName || 'Anonymous Judge',
        expiresIn: req.body.expiresIn || '7d'
      });

      // Note: Do NOT auto-create a session on link generation.
      // The session will be created when the judge visits the link and starts their session.
      // Auto-creating sessions here led to duplicate judge entries if multiple links were generated.

      // Construct the full URL
      const protocol = req.protocol;
      const host = req.get('host');
      const clientUrl = (process.env.CLIENT_URL || `${protocol}://${host.replace(':5000', ':3000')}`).replace(/\/+$/, '');
      const judgeUrl = `${clientUrl}/judge/${normalizedChannelId}/${cupId}?token=${token}`;

      logger.info(`Generated judge link for cup ${cupId} in channel ${normalizedChannelId}`);

      res.json({
        token,
        url: judgeUrl,
        cupId,
        channelId: normalizedChannelId,
        judgeName: req.body.judgeName || 'Anonymous Judge',
        expiresIn: req.body.expiresIn || '7d'
      });
    } catch (error) {
      logger.error('Error generating judge link:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to generate judge link' });
    }
  }
);

router.put('/channels/:channelId/cups/:cupId',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);

      const cup = await channelManager.prisma.cup.findFirst({
        where: {
          id: req.params.cupId,
          channelId: normalizedChannelId
        },
        include: {
          queueItems: {
            orderBy: { position: 'asc' },
            take: 20
          },
          _count: {
            select: {
              judgeScores: true
            }
          }
        }
      });

      if (!cup) {
        return res.status(404).json({ error: 'Cup not found' });
      }

      res.json({ cup });
    } catch (error) {
      logger.error('Error getting cup:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get cup' });
    }
  }
);

router.patch('/channels/:channelId/cups/:cupId',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);

      const allowedUpdates = ['title', 'theme', 'status', 'startsAt', 'endsAt', 'metadata'];
      const updates = {};
      
      for (const field of allowedUpdates) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const cup = await channelManager.prisma.cup.update({
        where: {
          id: req.params.cupId
        },
        data: updates
      });

      logger.info(`Cup updated: ${cup.id} - ${cup.status}`);
      res.json({ cup });
    } catch (error) {
      logger.error('Error updating cup:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to update cup' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/assign-item',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  [body('queueItemId').isInt().withMessage('Valid queue item ID required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);

      const queueItem = await channelManager.prisma.queueItem.update({
        where: {
          id: parseInt(req.body.queueItemId, 10)
        },
        data: {
          cupId: req.params.cupId
        }
      });

      logger.info(`Queue item ${queueItem.id} assigned to cup ${req.params.cupId}`);
      res.json({ queueItem });
    } catch (error) {
      logger.error('Error assigning item to cup:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to assign item' });
    }
  }
);

// Queue routes
router.get('/channels/:channelId/queue/current', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const queue = await queueService.getCurrentQueue();
    const isEnabled = await queueService.isQueueEnabled();

    res.json({
      channelId: normalizedChannelId,
      queue,
      enabled: isEnabled,
      currentlyPlaying: queueService.currentlyPlaying,
      total: queue.length
    });
  } catch (error) {
    logger.error('Error getting current queue:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get queue' });
  }
});

router.get('/channels/:channelId/queue/status', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const [enabled, size, maxSize, volume] = await Promise.all([
      queueService.isQueueEnabled(),
      queueService.getQueueSize(),
      queueService.getSetting('max_queue_size', '50'),
      queueService.getSetting('current_volume', '75')
    ]);

    res.json({
      channelId: normalizedChannelId,
      enabled,
      size,
      maxSize: parseInt(maxSize, 10),
      volume: parseInt(volume, 10)
    });
  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get queue status' });
  }
});

router.post('/channels/:channelId/queue/add',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR']),
  [
  body('url').isURL().withMessage('Valid URL is required'),
  body('submitter').notEmpty().withMessage('Submitter is required')
],
validate, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const videoService = req.app.get('videoService');
    if (!videoService) {
      return res.status(500).json({ error: 'Video service not available' });
    }

    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    // Get channel's max video duration setting
    const maxVideoDuration = await queueService.getSetting('max_video_duration', '300');
    const metadata = await videoService.getVideoMetadata(req.body.url, {
      maxDuration: parseInt(maxVideoDuration, 10)
    });
    const result = await queueService.addToQueue(metadata, req.body.submitter);

    res.status(201).json({
      queueItem: result.queueItem,
      item: result.queueItem,
      duplicate: result.duplicate,
      warnings: result.warnings
    });
  } catch (error) {
    logger.error('Error adding video to queue:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to add video to queue' });
  }
});

router.delete('/channels/:channelId/queue/:id',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR']),
  [
  param('id').isInt().withMessage('Valid item ID is required')
],
validate, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    await queueService.removeFromQueue(parseInt(req.params.id, 10), req.user.username);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing video from queue:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to remove video' });
  }
});

router.post('/channels/:channelId/queue/skip',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const nextVideo = await queueService.skipCurrent(req.user.username);
    res.json({ nextVideo });
  } catch (error) {
    logger.error('Error skipping video:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to skip video' });
  }
  }
);

router.post('/channels/:channelId/queue/clear',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER']),
  async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    await queueService.clearQueue(req.user.username);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error clearing queue:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to clear queue' });
  }
  }
);

router.post('/channels/:channelId/queue/shuffle',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER', 'OWNER', 'MANAGER']),
  [
    body('topEightIds').optional().isArray({ max: 8 }).withMessage('topEightIds must be an array'),
    body('topEightIds.*').optional().isInt().withMessage('Each topEightIds entry must be an integer'),
    body('seed').optional().isNumeric().withMessage('Seed must be a numeric value')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

      const payload = await queueService.triggerShuffle(req.user.username, {
        topEightIds: req.body?.topEightIds,
        seed: req.body?.seed
      });

      res.json({ shuffle: payload });
    } catch (error) {
      logger.error('Error triggering shuffle:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to trigger shuffle' });
    }
  }
);

router.get('/channels/:channelId/submissions',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

      const statuses = (req.query.status || 'PENDING')
        .toString()
        .split(',')
        .map((status) => status.trim().toUpperCase())
        .filter(Boolean);

      if (!statuses.length) {
        statuses.push('PENDING');
      }

      const rawLimit = (req.query.limit ?? '50').toString();
      const limit = rawLimit.toUpperCase() === 'ALL'
        ? undefined
        : Math.min(parseInt(rawLimit || '50', 10), 100);
      const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
      const activeCupsOnly = String(req.query.activeCupsOnly || '').toLowerCase() === 'true';

      const submissions = await queueService.listSubmissions({
        statuses,
        limit,
        offset,
        activeCupsOnly
      });

      res.json({
        submissions,
        meta: {
          count: submissions.length,
          limit: typeof limit === 'number' ? limit : 'ALL',
          offset,
          statuses
        }
      });
    } catch (error) {
      logger.error('Error fetching submissions:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to fetch submissions' });
    }
  }
);

router.post('/channels/:channelId/submissions/:itemId/review',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR']),
  [
    param('itemId').isInt().withMessage('Valid item ID is required'),
    body('action').isString().withMessage('Action is required')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

      const itemId = parseInt(req.params.itemId, 10);
      const action = req.body.action.toUpperCase();
      const note = req.body.note === undefined || req.body.note === null
        ? null
        : req.body.note.toString();
      const reason = req.body.reason ? req.body.reason.toString() : null;
      const position = req.body.position !== undefined ? parseInt(req.body.position, 10) : undefined;
      const moderatedByDisplayName = req.user?.displayName || null;

      let result = null;

      switch (action) {
        case 'APPROVE':
          result = await queueService.approveQueueItem(itemId, req.user.username, {
            note,
            position,
            moderatedByDisplayName
          });
          break;
        case 'REJECT':
          result = await queueService.rejectQueueItem(itemId, req.user.username, {
            note,
            reason,
            position,
            moderatedByDisplayName
          });
          break;
        case 'WARN':
          result = await queueService.warnQueueItem(itemId, req.user.username, {
            note,
            position,
            reason,
            moderatedByDisplayName
          });
          break;
        case 'TOP_EIGHT':
          result = await queueService.markTopEight(itemId, req.user.username, { note, position });
          break;
        case 'VIP':
          // Grant VIP status to an existing queue item (producer/manager action)
          try {
            const ok = await queueService.addVipForItem(itemId);
            if (!ok) {
              return res.status(400).json({ error: 'Failed to add VIP for item' });
            }
            const raw = await channelManager.prisma.queueItem.findUnique({
              where: { id: itemId },
              include: {
                submitter: { select: SUBMITTER_FIELDS },
                cup: true
              }
            });
            result = await queueService._hydrateQueueItem(raw);
          } catch (err) {
            logger.warn('Failed to hydrate or add VIP-updated item', { channelId: normalizedChannelId, itemId, error: err });
            return res.status(400).json({ error: err.message || 'Failed to add VIP' });
          }
          break;
        case 'UNVIP':
          // Revoke VIP status from an existing queue item
          try {
            await queueService._removeVipEntry(itemId);
            const raw2 = await channelManager.prisma.queueItem.findUnique({
              where: { id: itemId },
              include: {
                submitter: { select: SUBMITTER_FIELDS },
                cup: true
              }
            });
            result = await queueService._hydrateQueueItem(raw2);
          } catch (err) {
            logger.warn('Failed to remove VIP entry for item', { channelId: normalizedChannelId, itemId, error: err });
            return res.status(400).json({ error: err.message || 'Failed to remove VIP' });
          }
          break;
        case 'PENDING':
          result = await queueService.updateQueueItemStatus(itemId, 'PENDING', req.user.username, { note });
          break;
        case 'REMOVE':
          await queueService.removeFromQueue(itemId, req.user.username);
          break;
        default:
          return res.status(400).json({
            error: `Unsupported review action: ${action}`
          });
      }

      res.json({
        success: true,
        item: result || null,
        action
      });
    } catch (error) {
      logger.error('Error reviewing submission:', error);
      res.status(error.status || 400).json({ error: error.message || 'Failed to review submission' });
    }
  }
);

// Channel settings
router.get('/channels/:channelId/settings', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

  const settings = {
    queue_enabled: await queueService.getSetting('queue_enabled', 'false'),
    max_queue_size: await queueService.getSetting('max_queue_size', '0'),
    submission_cooldown: await queueService.getSetting('submission_cooldown', '30'),
    max_video_duration: await queueService.getSetting('max_video_duration', '300'),
    auto_play_next: await queueService.getSetting('auto_play_next', 'false'),
    current_volume: await queueService.getSetting('current_volume', '75'),
    max_per_user: await queueService.getSetting('max_per_user', '3'),
    shuffle_audio_url: await queueService.getSetting('shuffle_audio_url', ''),
    // Ad announcements
    ad_announcements_enabled: await queueService.getSetting('ad_announcements_enabled', 'true'),
    ad_warn_message: await queueService.getSetting('ad_warn_message', 'Heads up: ads will run in 30 seconds. BRB!'),
    ad_start_message: await queueService.getSetting('ad_start_message', 'Ad break starting now — see you after the ads!'),
    ad_end_message: await queueService.getSetting('ad_end_message', 'Ads are over — welcome back!')
  };

    res.json({ channelId: normalizedChannelId, settings });
  } catch (error) {
    logger.error('Error getting settings:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get settings' });
  }
});

// Authenticated VIP list for channel owners
router.get('/channels/:channelId/vip', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const vipQueue = await queueService._getVipList();
    res.json({ channelId: normalizedChannelId, vipQueue });
  } catch (error) {
    logger.error('Error getting VIP list:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get VIP list' });
  }
});

router.put('/channels/:channelId/settings/:key', requireAuth, [
  param('key').notEmpty().withMessage('Setting key is required'),
  body('value').not().isEmpty().withMessage('Setting value is required')
], validate, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const key = String(req.params.key || '');
    // Restrict ad_* settings to Owner/Manager
    const normalizedChannelId = key.startsWith('ad_')
      ? await ensureOwnerOrManager(channelManager, req.user.id, req.params.channelId)
      : await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    await queueService.updateSetting(key, req.body.value);

    res.json({
      success: true,
      channelId: normalizedChannelId,
      key,
      value: req.body.value
    });
  } catch (error) {
    logger.error('Error updating setting:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to update setting' });
  }
});

// Upload shuffle audio and persist setting
router.post(
  '/channels/:channelId/uploads/shuffle-audio',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER']),
  upload.single('file'),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const publicRel = `/uploads/${normalizedChannelId}/${req.file.filename}`;
      const proto = req.protocol;
      const host = req.get('host');
      const publicUrl = `${proto}://${host}${publicRel}`;

      // Persist as channel setting and notify clients
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      // Store relative path to avoid mixed-content issues behind HTTPS
      await queueService.updateSetting('shuffle_audio_url', publicRel);

      try {
        logger.info('Shuffle audio saved', {
          channelId: normalizedChannelId,
          filename: req.file.filename,
          destination: req.file.destination,
          diskPath: req.file.path || null,
          size: req.file.size
        });
      } catch (_) {}
      logger.info(`Uploaded shuffle audio for ${normalizedChannelId}: ${publicUrl}`);
      return res.status(201).json({ url: publicRel, absoluteUrl: publicUrl, filename: req.file.filename, channelId: normalizedChannelId });
    } catch (error) {
      logger.error('Error uploading shuffle audio:', error);
      const status = error.status || 500;
      return res.status(status).json({ error: error.message || 'Upload failed' });
    }
  }
);

// Helpers for soundboard storage in settings
const getSoundboardItems = async (queueService) => {
  try {
    const raw = await queueService.getSetting('soundboard_items', '[]');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
};

const setSoundboardItems = async (queueService, items) => {
  await queueService.updateSetting('soundboard_items', JSON.stringify(items || []));
};

// List soundboard items
router.get('/channels/:channelId/soundboard', requireAuth, requireChannelRole(['OWNER','MANAGER','PRODUCER']), async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const channelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, channelId);
    const items = await getSoundboardItems(queueService);
    res.json({ items });
  } catch (error) {
    logger.error('Error listing soundboard items:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to load soundboard' });
  }
});

// Upload a new soundboard item
router.post('/channels/:channelId/soundboard/upload', requireAuth, requireChannelRole(['OWNER','MANAGER','PRODUCER']), sbUpload.single('file'), async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const channelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, channelId);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const name = (req.body?.name || req.file.originalname || 'Sound').toString().slice(0, 100);
    const urlRel = `/uploads/${channelId}/${req.file.filename}`;

    const items = await getSoundboardItems(queueService);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const item = { id, name, url: urlRel, filename: req.file.filename, createdAt: new Date().toISOString() };
    const next = [item, ...items].slice(0, 100); // cap to 100
    await setSoundboardItems(queueService, next);

    try {
      logger.info('Soundboard item saved', {
        channelId,
        id: item.id,
        name: item.name,
        filename: req.file.filename,
        destination: req.file.destination,
        diskPath: req.file.path || null,
        size: req.file.size,
        urlRel
      });
    } catch (_) {}
    res.status(201).json({ item });
  } catch (error) {
    logger.error('Error uploading soundboard item:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to upload sound' });
  }
});

// Delete a soundboard item
router.delete('/channels/:channelId/soundboard/:itemId', requireAuth, requireChannelRole(['OWNER','MANAGER','PRODUCER']), async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const channelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, channelId);
    const items = await getSoundboardItems(queueService);
    const idx = items.findIndex((it) => it.id === req.params.itemId);
    if (idx < 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const [removed] = items.splice(idx, 1);
    await setSoundboardItems(queueService, items);
    // try to remove file if it's in our uploads folder
    try {
      if (removed?.filename) {
        const filePath = path.join(UPLOADS_ROOT, channelId, removed.filename);
        fs.unlink(filePath, () => {});
      }
    } catch(_) {}
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting soundboard item:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to delete sound' });
  }
});

// Trigger playing a soundboard item to channel clients
router.post('/channels/:channelId/soundboard/play', requireAuth, requireChannelRole(['OWNER','MANAGER','PRODUCER']), async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const channelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, channelId);
    const items = await getSoundboardItems(queueService);
    let payload = null;
    if (req.body?.itemId) {
      const item = items.find((it) => it.id === req.body.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      payload = { id: item.id, name: item.name, url: item.url };
    } else if (req.body?.url) {
      payload = { id: req.body.id || null, name: req.body.name || 'Sound', url: req.body.url };
    } else {
      return res.status(400).json({ error: 'itemId or url required' });
    }
    // Broadcast via channel namespace
    try {
      const sockets = await queueService.io.fetchSockets();
      logger.info(`Emitting soundboard:play to /channel/${channelId} (listeners=${sockets.length})`, payload);
    } catch (_) {
      logger.info(`Emitting soundboard:play to /channel/${channelId}`);
    }
    queueService.io.emit('soundboard:play', payload);
    res.json({ ok: true, payload });
  } catch (error) {
    logger.error('Error triggering soundboard play:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to play sound' });
  }
});

// Judge-token: list soundboard
router.get('/channels/:channelId/cups/:cupId/soundboard', authenticateJudgeToken, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const queueService = getQueueServiceOrThrow(channelManager, req.judgeAuth.channelId);
    const items = await getSoundboardItems(queueService);
    res.json({ items });
  } catch (error) {
    logger.error('Error (judge) listing soundboard:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to load soundboard' });
  }
});

// Judge-token: trigger play (always to all)
router.post('/channels/:channelId/cups/:cupId/soundboard/play', authenticateJudgeToken, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const queueService = getQueueServiceOrThrow(channelManager, req.judgeAuth.channelId);
    const items = await getSoundboardItems(queueService);
    let payload = null;
    if (req.body?.itemId) {
      const item = items.find((it) => it.id === req.body.itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      payload = { id: item.id, name: item.name, url: item.url };
    } else if (req.body?.url) {
      payload = { id: null, name: 'Sound', url: req.body.url };
    } else {
      return res.status(400).json({ error: 'itemId or url required' });
    }
    try {
      const sockets = await queueService.io.fetchSockets();
      logger.info(`(judge) Emitting soundboard:play to /channel/${req.judgeAuth.channelId} (listeners=${sockets.length})`, payload);
    } catch (_) {
      logger.info(`(judge) Emitting soundboard:play to /channel/${req.judgeAuth.channelId}`);
    }
    queueService.io.emit('soundboard:play', payload);
    res.json({ ok: true, payload });
  } catch (error) {
    logger.error('Error (judge) triggering soundboard play:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to play sound' });
  }
});

// Bot and diagnostics
router.get('/bot/status', async (req, res) => {
  try {
    const bot = req.app.get('bot');
    if (!bot) {
      return res.json({ connected: false, error: 'Bot not initialized' });
    }

    res.json(bot.getStats());
  } catch (error) {
    logger.error('Error getting bot status:', error);
    res.status(500).json({ error: 'Failed to get bot status' });
  }
});

router.post('/video/validate', [
  body('url').isURL().withMessage('Valid URL is required')
], validate, async (req, res) => {
  try {
    const videoService = req.app.get('videoService');
    if (!videoService) {
      return res.status(500).json({ error: 'Video service not available' });
    }

    const isValid = videoService.isValidVideoUrl(req.body.url);
    if (!isValid) {
      return res.json({ valid: false, error: 'Unsupported video URL format' });
    }

    try {
      // For validation, use a generous default since we don't have channel context
      // The actual submission will use the channel's setting
      const metadata = await videoService.getVideoMetadata(req.body.url, {
        maxDuration: 3600 // 1 hour for validation
      });
      return res.json({ valid: true, metadata });
    } catch (error) {
      return res.json({ valid: false, error: error.message });
    }
  } catch (error) {
    logger.error('Error validating video:', error);
    res.status(500).json({ error: 'Failed to validate video' });
  }
});

// Judge routes
router.post('/channels/:channelId/cups/:cupId/judge/session/start',
  authenticateJudgeToken,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      // Use the judgeId and judgeName from the token
      const session = await judgeService.createSession(
        req.judgeAuth.cupId,
        req.judgeAuth.judgeId,
        req.judgeAuth.judgeName
      );

      res.json({ session });
    } catch (error) {
      logger.error('Error starting judge session:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to start session' });
    }
  }
);

// List judge sessions for a cup (admins/producers/hosts)
router.get('/channels/:channelId/cups/:cupId/judges',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);
      // Ensure the channel exists and is active; throws if not
      getQueueServiceOrThrow(channelManager, normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const sessions = await judgeService.listSessions(req.params.cupId);

      res.json({ judges: sessions });
    } catch (error) {
      logger.error('Error listing judge sessions:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to list judge sessions' });
    }
  }
);

// Revoke a judge session/token (admin action)
router.post('/channels/:channelId/cups/:cupId/judges/:judgeId/revoke',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const session = await judgeService.endSession(req.params.cupId, req.params.judgeId);

      res.json({ session });
    } catch (error) {
      logger.error('Error revoking judge session:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to revoke judge session' });
    }
  }
);

// Regenerate a judge token for a given judge identifier (returns new token + session)
router.post('/channels/:channelId/cups/:cupId/judges/:judgeId/regenerate',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  [
    body('judgeName').optional().isString().withMessage('Judge name must be a string'),
    body('expiresIn').optional().isString().withMessage('expiresIn must be a string (e.g., "7d")')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const { token, session } = await judgeService.regenerateToken(req.params.cupId, req.params.judgeId, {
        judgeName: req.body.judgeName,
        expiresIn: req.body.expiresIn
      });

      // Build judge overlay/url for convenience
      const protocol = req.protocol;
      const host = req.get('host');
      const clientUrl = (process.env.CLIENT_URL || `${protocol}://${host.replace(':5000', ':3000')}`).replace(/\/+$/, '');
      const judgeUrl = `${clientUrl}/judge/${normalizedChannelId}/${req.params.cupId}?token=${token}`;

      res.json({ token, url: judgeUrl, session });
    } catch (error) {
      logger.error('Error regenerating judge token:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to regenerate judge token' });
    }
  }
);

// Prune all inactive (ENDED) judge sessions for a cup
router.post('/channels/:channelId/cups/:cupId/judges/prune',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  [
    body('olderThanMinutes').optional().isInt({ min: 0 }).withMessage('olderThanMinutes must be a non-negative integer')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const { olderThanMinutes } = req.body || {};
      const result = await judgeService.pruneInactiveSessions(req.params.cupId, { olderThanMinutes });

      res.json({ success: true, deleted: result.count });
    } catch (error) {
      logger.error('Error pruning inactive judge sessions:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to prune inactive judges' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/judge/session/end',
  authenticateJudgeToken,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const session = await judgeService.endSession(req.judgeAuth.cupId, req.judgeAuth.judgeId);

      res.json({ session });
    } catch (error) {
      logger.error('Error ending judge session:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to end session' });
    }
  }
);

// Update judge name in session
router.patch('/channels/:channelId/cups/:cupId/judge/name',
  authenticateJudgeToken,
  [
    body('judgeName').notEmpty().withMessage('Judge name is required')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const session = await judgeService.updateJudgeName(
        req.judgeAuth.cupId,
        req.judgeAuth.judgeId,
        req.body.judgeName
      );

      res.json({ session });
    } catch (error) {
      logger.error('Error updating judge name:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to update name' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/score',
  authenticateJudgeToken,
  [
    param('itemId').isInt().withMessage('Valid item ID is required'),
    body('score').isFloat({ min: 0, max: 5 }).withMessage('Score must be between 0 and 5')
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const score = Number(req.body.score);
      const comment = req.body.comment || null;

      const judgeScore = await judgeService.submitScore(
        req.judgeAuth.cupId,
        itemId,
        req.judgeAuth.judgeId,
        score,
        comment,
        req.judgeAuth.judgeName
      );

      res.json({ judgeScore });
    } catch (error) {
      logger.error('Error submitting judge score:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to submit score' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/lock',
  authenticateJudgeToken,
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const judgeScore = await judgeService.lockVote(req.judgeAuth.cupId, itemId, req.judgeAuth.judgeId);

      res.json({ judgeScore });
    } catch (error) {
      logger.error('Error locking vote:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to lock vote' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/unlock',
  authenticateJudgeToken,
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const judgeScore = await judgeService.unlockVote(req.judgeAuth.cupId, itemId, req.judgeAuth.judgeId);

      res.json({ judgeScore });
    } catch (error) {
      logger.error('Error unlocking vote:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to unlock vote' });
    }
  }
);

router.get('/channels/:channelId/cups/:cupId/items/:itemId/score',
  authenticateJudgeToken,
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const judgeService = channelManager.getJudgeService(req.judgeAuth.channelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const judgeScore = await judgeService.getJudgeScore(req.judgeAuth.cupId, itemId, req.judgeAuth.judgeId);

      res.json({ judgeScore });
    } catch (error) {
      logger.error('Error getting judge score:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get score' });
    }
  }
);

router.get('/channels/:channelId/cups/:cupId/items/:itemId/scores',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const scores = await judgeService.getScoresForItem(req.params.cupId, itemId);
      const average = await judgeService.calculateAverageScore(req.params.cupId, itemId);
      const completion = await judgeService.areAllScoresSubmitted(req.params.cupId, itemId);

      res.json({ 
        scores,
        average,
        completion
      });
    } catch (error) {
      logger.error('Error getting scores for item:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get scores' });
    }
  }
);

router.get('/channels/:channelId/roles',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const roleService = req.app.get('roleService');
      if (!roleService) {
        return res.status(500).json({ error: 'Role service not available' });
      }

      const normalizedChannelId = await ensureOwnerOrManager(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const [owners, assignments, invites] = await Promise.all([
        channelManager.prisma.channelOwner.findMany({
          where: { channelId: normalizedChannelId },
          include: {
            account: {
              select: {
                id: true,
                username: true,
                displayName: true,
                profileImageUrl: true
              }
            }
          },
          orderBy: [
            { role: 'asc' },
            { createdAt: 'asc' }
          ]
        }),
        channelManager.prisma.channelRoleAssignment.findMany({
          where: { channelId: normalizedChannelId },
          include: {
            account: {
              select: {
                id: true,
                username: true,
                displayName: true,
                profileImageUrl: true
              }
            },
            cup: {
              select: {
                id: true,
                title: true,
                slug: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }),
        channelManager.prisma.channelRoleInvite.findMany({
          where: { channelId: normalizedChannelId },
          include: {
            assignedByAccount: {
              select: {
                id: true,
                username: true,
                displayName: true,
                profileImageUrl: true
              }
            },
            cup: {
              select: {
                id: true,
                title: true,
                slug: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        })
      ]);

      res.json({
        owners: owners.map(formatChannelOwner),
        roles: assignments.map(formatRoleAssignment),
        invites: invites.map(formatRoleInvite)
      });
    } catch (error) {
      logger.error('Error listing channel roles:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load channel roles' });
    }
  }
);

// Add a channel manager (owner-only)
router.post('/channels/:channelId/owners',
  requireAuth,
  [
    body('username').optional().isString().trim(),
    body('accountId').optional().isString(),
    body('role').optional().isString()
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await ensureOwnerOnly(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const rawRole = (req.body.role || 'MANAGER').toString().trim().toUpperCase();
      if (rawRole !== 'MANAGER') {
        return res.status(400).json({ error: 'Only MANAGER role can be granted via this endpoint' });
      }

      let targetAccountId = (req.body.accountId || '').toString().trim();
      const username = (req.body.username || '').toString().trim();

      if (!targetAccountId && !username) {
        return res.status(400).json({ error: 'Username or accountId is required' });
      }

      if (!targetAccountId) {
        const account = await channelManager.prisma.account.findFirst({
          where: {
            OR: [
              { username: { equals: username, mode: 'insensitive' } },
              { displayName: { equals: username, mode: 'insensitive' } }
            ]
          }
        });

        if (!account) {
          return res.status(404).json({ error: 'Account not found' });
        }

        targetAccountId = account.id;
      }

      // Prevent demoting an owner inadvertently
      const existing = await channelManager.prisma.channelOwner.findUnique({
        where: {
          accountId_channelId: {
            accountId: targetAccountId,
            channelId: normalizedChannelId
          }
        }
      });

      if (existing && existing.role === 'OWNER') {
        return res.status(400).json({ error: 'Target is already an owner; cannot change owner to manager' });
      }

      const ownerRecord = await channelManager.prisma.channelOwner.upsert({
        where: {
          accountId_channelId: {
            accountId: targetAccountId,
            channelId: normalizedChannelId
          }
        },
        update: { role: 'MANAGER' },
        create: {
          accountId: targetAccountId,
          channelId: normalizedChannelId,
          role: 'MANAGER'
        },
        include: {
          account: {
            select: { id: true, username: true, displayName: true, profileImageUrl: true }
          }
        }
      });

      return res.status(201).json({ owner: formatChannelOwner(ownerRecord) });
    } catch (error) {
      logger.error('Error adding channel manager:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to add manager' });
    }
  }
);

// Remove a channel manager (owner-only). Only MANAGER records can be removed here.
router.delete('/channels/:channelId/owners/:ownerId',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await ensureOwnerOnly(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const ownerId = parseInt(req.params.ownerId, 10);
      if (!Number.isInteger(ownerId)) {
        return res.status(400).json({ error: 'Invalid owner record ID' });
      }

      const record = await channelManager.prisma.channelOwner.findUnique({ where: { id: ownerId } });
      if (!record || record.channelId !== normalizedChannelId) {
        return res.status(404).json({ error: 'Owner record not found' });
      }

      if (record.role !== 'MANAGER') {
        return res.status(400).json({ error: 'Only MANAGER records can be removed via this endpoint' });
      }

      await channelManager.prisma.channelOwner.delete({ where: { id: ownerId } });
      return res.json({ success: true });
    } catch (error) {
      logger.error('Error removing channel manager:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to remove manager' });
    }
  }
);

router.post('/channels/:channelId/roles',
  requireAuth,
  [
    body('role').isString().withMessage('Role is required'),
    body('username').optional().isString().trim(),
    body('accountId').optional().isString(),
    body('cupId').optional().isString(),
    body('expiresAt').optional().isISO8601().withMessage('expiresAt must be a valid ISO date'),
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const roleService = req.app.get('roleService');
      if (!roleService) {
        return res.status(500).json({ error: 'Role service not available' });
      }

      const normalizedChannelId = await ensureOwnerOrManager(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const rawRole = (req.body.role || '').toString().trim().toUpperCase();
      const allowedRoles = ['PRODUCER', 'HOST', 'JUDGE', 'MODERATOR'];
      if (!allowedRoles.includes(rawRole)) {
        return res.status(400).json({ error: 'Invalid role selection' });
      }

      let targetAccountId = (req.body.accountId || '').toString().trim();
      const username = (req.body.username || '').toString().trim();

      if (!targetAccountId && !username) {
        return res.status(400).json({ error: 'Username or accountId is required' });
      }

      if (!targetAccountId) {
        const account = await channelManager.prisma.account.findFirst({
          where: {
            OR: [
              {
                username: {
                  equals: username,
                  mode: 'insensitive'
                }
              },
              {
                displayName: {
                  equals: username,
                  mode: 'insensitive'
                }
              }
            ]
          }
        });

        if (!account) {
          // No account yet — create a role invite instead
          const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
          const lowerUsername = username.toLowerCase();

          let invite;
          if (req.body.cupId) {
            // Cup-scoped invite: safe to upsert on composite unique
            invite = await channelManager.prisma.channelRoleInvite.upsert({
              where: {
                channelId_invitedUsername_role_cupId: {
                  channelId: normalizedChannelId,
                  invitedUsername: lowerUsername,
                  role: rawRole,
                  cupId: req.body.cupId
                }
              },
              update: {
                assignedBy: req.user.id,
                expiresAt
              },
              create: {
                channelId: normalizedChannelId,
                invitedUsername: lowerUsername,
                role: rawRole,
                cupId: req.body.cupId,
                assignedBy: req.user.id,
                expiresAt
              },
              include: {
                assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                cup: { select: { id: true, title: true, slug: true, status: true } }
              }
            });
          } else {
            // Global (no cup) invite: cannot upsert by composite (cupId is null). Manually find-or-create
            const existing = await channelManager.prisma.channelRoleInvite.findFirst({
              where: {
                channelId: normalizedChannelId,
                invitedUsername: lowerUsername,
                role: rawRole,
                cupId: null
              },
              include: {
                assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                cup: { select: { id: true, title: true, slug: true, status: true } }
              }
            });
            if (existing) {
              invite = await channelManager.prisma.channelRoleInvite.update({
                where: { id: existing.id },
                data: { assignedBy: req.user.id, expiresAt },
                include: {
                  assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                  cup: { select: { id: true, title: true, slug: true, status: true } }
                }
              });
            } else {
              invite = await channelManager.prisma.channelRoleInvite.create({
                data: {
                  channelId: normalizedChannelId,
                  invitedUsername: lowerUsername,
                  role: rawRole,
                  cupId: null,
                  assignedBy: req.user.id,
                  expiresAt
                },
                include: {
                  assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                  cup: { select: { id: true, title: true, slug: true, status: true } }
                }
              });
            }
          }

          return res.status(201).json({ invite: formatRoleInvite(invite) });
        }

        targetAccountId = account.id;
      }

      const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ error: 'expiresAt must be a valid date' });
      }

      const assignment = await roleService.assignChannelRole({
        channelId: normalizedChannelId,
        accountId: targetAccountId,
        role: rawRole,
        cupId: req.body.cupId || null,
        assignedBy: req.user.id,
        expiresAt
      });

      res.status(201).json({
        role: formatRoleAssignment(assignment)
      });
    } catch (error) {
      logger.error('Error assigning channel role:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to assign channel role' });
    }
  }
);

// Role invite endpoints
router.get('/channels/:channelId/role-invites',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await ensureOwnerOrManager(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const invites = await channelManager.prisma.channelRoleInvite.findMany({
        where: { channelId: normalizedChannelId },
        include: {
          assignedByAccount: {
            select: { id: true, username: true, displayName: true, profileImageUrl: true }
          },
          cup: {
            select: { id: true, title: true, slug: true, status: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      res.json({ invites: invites.map(formatRoleInvite) });
    } catch (error) {
      logger.error('Error listing role invites:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to load role invites' });
    }
  }
);

router.post('/channels/:channelId/role-invites',
  requireAuth,
  [
    body('username').isString().trim().withMessage('Username is required'),
    body('role').isString().withMessage('Role is required'),
    body('cupId').optional().isString(),
    body('expiresAt').optional().isISO8601().withMessage('expiresAt must be a valid ISO date'),
    body('note').optional().isString()
  ],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await ensureOwnerOrManager(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const username = (req.body.username || '').toString().trim();
      const rawRole = (req.body.role || '').toString().trim().toUpperCase();
      const allowedRoles = ['PRODUCER', 'HOST', 'JUDGE', 'MODERATOR'];
      if (!allowedRoles.includes(rawRole)) {
        return res.status(400).json({ error: 'Invalid role selection' });
      }

      const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ error: 'expiresAt must be a valid date' });
      }

      // If the account already exists, assign immediately instead of inviting
      const existingAccount = await channelManager.prisma.account.findFirst({
        where: {
          OR: [
            { username: { equals: username, mode: 'insensitive' } },
            { displayName: { equals: username, mode: 'insensitive' } }
          ]
        }
      });

      if (existingAccount) {
        const roleService = req.app.get('roleService');
        const assignment = await roleService.assignChannelRole({
          channelId: normalizedChannelId,
          accountId: existingAccount.id,
          role: rawRole,
          cupId: req.body.cupId || null,
          assignedBy: req.user.id,
          expiresAt
        });
        return res.status(201).json({ role: formatRoleAssignment(assignment) });
      }

      const lowerUsername = username.toLowerCase();
      let invite;
      if (req.body.cupId) {
        invite = await channelManager.prisma.channelRoleInvite.upsert({
          where: {
            channelId_invitedUsername_role_cupId: {
              channelId: normalizedChannelId,
              invitedUsername: lowerUsername,
              role: rawRole,
              cupId: req.body.cupId
            }
          },
          update: {
            assignedBy: req.user.id,
            note: req.body.note || undefined,
            expiresAt
          },
          create: {
            channelId: normalizedChannelId,
            invitedUsername: lowerUsername,
            role: rawRole,
            cupId: req.body.cupId,
            note: req.body.note || undefined,
            assignedBy: req.user.id,
            expiresAt
          },
          include: {
            assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
            cup: { select: { id: true, title: true, slug: true, status: true } }
          }
        });
      } else {
        const existing = await channelManager.prisma.channelRoleInvite.findFirst({
          where: {
            channelId: normalizedChannelId,
            invitedUsername: lowerUsername,
            role: rawRole,
            cupId: null
          },
          include: {
            assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
            cup: { select: { id: true, title: true, slug: true, status: true } }
          }
        });
        if (existing) {
          invite = await channelManager.prisma.channelRoleInvite.update({
            where: { id: existing.id },
            data: {
              assignedBy: req.user.id,
              note: req.body.note || undefined,
              expiresAt
            },
            include: {
              assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
              cup: { select: { id: true, title: true, slug: true, status: true } }
            }
          });
        } else {
          invite = await channelManager.prisma.channelRoleInvite.create({
            data: {
              channelId: normalizedChannelId,
              invitedUsername: lowerUsername,
              role: rawRole,
              cupId: null,
              note: req.body.note || undefined,
              assignedBy: req.user.id,
              expiresAt
            },
            include: {
              assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
              cup: { select: { id: true, title: true, slug: true, status: true } }
            }
          });
        }
      }

      return res.status(201).json({ invite: formatRoleInvite(invite) });
    } catch (error) {
      logger.error('Error creating role invite:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to create role invite' });
    }
  }
);

router.delete('/channels/:channelId/role-invites/:inviteId',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await ensureOwnerOrManager(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const inviteId = parseInt(req.params.inviteId, 10);
      if (!Number.isInteger(inviteId)) {
        return res.status(400).json({ error: 'Invalid invite ID' });
      }

      const invite = await channelManager.prisma.channelRoleInvite.findUnique({ where: { id: inviteId } });
      if (!invite || invite.channelId !== normalizedChannelId) {
        return res.status(404).json({ error: 'Role invite not found' });
      }

      await channelManager.prisma.channelRoleInvite.delete({ where: { id: inviteId } });
      return res.json({ success: true });
    } catch (error) {
      logger.error('Error removing role invite:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to remove role invite' });
    }
  }
);

router.delete('/channels/:channelId/roles/:assignmentId',
  requireAuth,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const roleService = req.app.get('roleService');
      if (!roleService) {
        return res.status(500).json({ error: 'Role service not available' });
      }

      const normalizedChannelId = await ensureOwnerOrManager(
        channelManager,
        req.user.id,
        req.params.channelId
      );

      const assignmentId = parseInt(req.params.assignmentId, 10);
      if (!Number.isInteger(assignmentId)) {
        return res.status(400).json({ error: 'Invalid assignment ID' });
      }

      const assignment = await channelManager.prisma.channelRoleAssignment.findUnique({
        where: { id: assignmentId }
      });

      if (!assignment || assignment.channelId !== normalizedChannelId) {
        return res.status(404).json({ error: 'Role assignment not found' });
      }

      await roleService.revokeChannelRole({
        channelId: normalizedChannelId,
        accountId: assignment.accountId,
        role: assignment.role,
        cupId: assignment.cupId
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Error removing channel role:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to remove channel role' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/start',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const itemId = parseInt(req.params.itemId, 10);

      const votingState = await queueService.startVoting(itemId, {
        initiatedBy: req.user?.displayName || req.user?.username || req.user?.id || 'producer'
      });

      res.json({ voting: votingState });
    } catch (error) {
      logger.error('Error starting voting session:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to start voting' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/cancel',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const itemId = parseInt(req.params.itemId, 10);
      const votingState = queueService.getVotingState();

      if (!votingState || votingState.queueItemId !== itemId) {
        return res.status(400).json({ error: 'No active voting session for this queue item' });
      }

      const result = queueService.cancelVoting({
        reason: req.body?.reason || 'cancelled',
        initiatedBy: req.user?.displayName || req.user?.username || req.user?.id || 'producer'
      });

      res.json({ voting: result });
    } catch (error) {
      logger.error('Error cancelling voting session:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to cancel voting' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/reveal-next',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const itemId = parseInt(req.params.itemId, 10);
      const currentVoting = queueService.getVotingState();

      if (!currentVoting || currentVoting.queueItemId !== itemId) {
        return res.status(400).json({ error: 'No active voting session for this queue item' });
      }

      const votingState = queueService.advanceJudgeReveal();
      res.json({ voting: votingState });
    } catch (error) {
      logger.error('Error revealing next judge score:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to reveal next judge score' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/reveal-average',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const itemId = parseInt(req.params.itemId, 10);
      const currentVoting = queueService.getVotingState();

      if (!currentVoting || currentVoting.queueItemId !== itemId) {
        return res.status(400).json({ error: 'No active voting session for this queue item' });
      }

      const votingState = queueService.revealAverage();
      res.json({ voting: votingState });
    } catch (error) {
      logger.error('Error revealing average score:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to reveal average score' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/reveal-social',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const itemId = parseInt(req.params.itemId, 10);
      const currentVoting = queueService.getVotingState();

      if (!currentVoting || currentVoting.queueItemId !== itemId) {
        return res.status(400).json({ error: 'No active voting session for this queue item' });
      }

      const votingState = await queueService.revealSocialScore();
      res.json({ voting: votingState });
    } catch (error) {
      logger.error('Error revealing social score:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to reveal social score' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/complete',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const itemId = parseInt(req.params.itemId, 10);
      const currentVoting = queueService.getVotingState();

      if (!currentVoting || currentVoting.queueItemId !== itemId) {
        return res.status(400).json({ error: 'No active voting session for this queue item' });
      }

      const votingState = queueService.completeVoting({
        reason: req.body?.reason || 'manual-complete'
      });
      res.json({ voting: votingState });
    } catch (error) {
      logger.error('Error completing voting session:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to complete voting session' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/force-lock',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const result = await judgeService.forceLockAllVotes(req.params.cupId, itemId);

      res.json({ result });
    } catch (error) {
      logger.error('Error force-locking votes:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to force-lock votes' });
    }
  }
);

// Remove a judge from the current voting session (optionally end their session)
router.post('/channels/:channelId/cups/:cupId/items/:itemId/voting/judges/:judgeId/remove',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

      const itemId = parseInt(req.params.itemId, 10);
      const currentVoting = queueService.getVotingState();

      if (!currentVoting || currentVoting.queueItemId !== itemId) {
        return res.status(400).json({ error: 'No active voting session for this queue item' });
      }

      const judgeId = req.params.judgeId;
      const updated = queueService.removeJudgeFromCurrentVoting(judgeId);

      // Optionally end the judge session too
      const endSession = String(req.query.endSession || req.body?.endSession || '').toLowerCase() === 'true';
      if (endSession) {
        try {
          const judgeService = channelManager.getJudgeService(normalizedChannelId);
          if (judgeService) {
            await judgeService.endSession(req.params.cupId, judgeId);
          }
        } catch (e) {
          logger.warn('Failed to end judge session during remove', { channelId: normalizedChannelId, judgeId, error: e });
        }
      }

      res.json({ voting: updated });
    } catch (error) {
      logger.error('Error removing judge from voting:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to remove judge' });
    }
  }
);

router.post('/channels/:channelId/cups/:cupId/items/:itemId/finalize',
  requireAuth,
  requireChannelRole(['HOST', 'PRODUCER']),
  [param('itemId').isInt().withMessage('Valid item ID is required')],
  validate,
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const judgeService = channelManager.getJudgeService(normalizedChannelId);

      if (!judgeService) {
        return res.status(500).json({ error: 'Judge service not available' });
      }

      const itemId = parseInt(req.params.itemId, 10);
      const cupId = req.params.cupId;

      const queueItem = await channelManager.prisma.queueItem.findFirst({
        where: {
          id: itemId,
          channelId: normalizedChannelId
        },
        include: {
          judgeScores: true,
          submitter: {
            select: SUBMITTER_FIELDS
          }
        }
      });

      if (!queueItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      if (queueItem.cupId !== cupId) {
        return res.status(400).json({ error: 'Queue item does not belong to this cup' });
      }

      const summary = await judgeService.calculateAverageScore(cupId, itemId);

      if (!summary || summary.count === 0 || typeof summary.average !== 'number') {
        return res.status(400).json({ error: 'Cannot finalize score without judge submissions' });
      }

      const updatedItem = await channelManager.prisma.queueItem.update({
        where: { id: itemId },
        data: {
          status: 'SCORED',
          playedAt: queueItem.playedAt || new Date()
        },
        include: {
          submitter: {
            select: SUBMITTER_FIELDS
          },
          judgeScores: true
        }
      });

      const { standings, videos, cup } = await channelManager.rebuildCupStandings(normalizedChannelId, cupId);
      const updatedVideo = videos.find((video) => video.queueItemId === itemId) || null;

      const channelInstance = channelManager.getChannelInstance(normalizedChannelId);
      if (channelInstance?.namespace) {
        channelInstance.namespace.emit('queue:item_scored', {
          cupId,
          queueItemId: itemId,
          average: summary,
          video: updatedVideo
        });
        channelInstance.namespace.emit('cup:standings_updated', {
          cupId,
          standings,
          videos,
          cup
        });
      }

      // Ensure overlays/clients remove the item from the active queue immediately
      try {
        // Remove from VIP list if present
        await queueService._removeVipEntry(itemId);
      } catch (_) {}
      try {
        // Notify clients about removal and then emit a reordered queue snapshot
        queueService.io.emit('queue:video_removed', { id: itemId });
      } catch (e) {
        logger.warn('Failed to emit queue:video_removed after finalize', { channelId: normalizedChannelId, itemId, error: e });
      }
      try {
        await queueService.reorderQueue();
      } catch (e) {
        logger.warn('Failed to reorder queue after finalize', { channelId: normalizedChannelId, itemId, error: e });
      }

      const enrichedItem = {
        ...updatedItem,
        submitterAlias: updatedItem.submitterAlias || null,
        publicSubmitterName: (updatedItem.submitterAlias || updatedItem.submitter?.twitchUsername) || null
      };

      const enrichedVideos = videos.map((video) => ({
        ...video,
        submitterAlias: video.submitterAlias || null,
        publicSubmitterName:
          video.publicSubmitterName ||
          video.submitterAlias ||
          video.submitter?.twitchUsername ||
          null
      }));
      const enrichedVideoById = new Map(
        enrichedVideos
          .filter((video) => Number.isInteger(video.queueItemId))
          .map((video) => [video.queueItemId, video])
      );
      const enrichedUpdatedVideo = enrichedVideoById.get(itemId) || updatedVideo;

      const enrichedStandings = standings.map((entry) => ({
        ...entry,
        submitterAlias: entry.submitterAlias || null,
        publicSubmitterName:
          entry.publicSubmitterName || entry.submitterAlias || entry.submitterUsername || null
      }));

      try {
        queueService.completeVoting({
          reason: 'finalized',
          finalAverage: summary?.average ?? null,
          finalVideo: enrichedUpdatedVideo || {
            queueItemId: itemId,
            title: queueItem.title
          }
        });
      } catch (eventError) {
        logger.warn('Failed to mark voting session as finalized', {
          channelId: normalizedChannelId,
          itemId,
          error: eventError
        });
      }

      res.json({
        item: enrichedItem,
        average: summary,
        standings: enrichedStandings,
        videos: enrichedVideos,
        cup,
        video: enrichedUpdatedVideo
      });
    } catch (error) {
      logger.error('Error finalizing queue item score:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to finalize score' });
    }
  }
);

router.get('/channels/:channelId/cups/:cupId/standings',
  requireAuth,
  requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
  async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);

      const { standings, videos, cup } = await channelManager.rebuildCupStandings(normalizedChannelId, req.params.cupId);
      const enrichedStandings = standings.map((entry) => ({
        ...entry,
        submitterAlias: entry.submitterAlias || null,
        publicSubmitterName:
          entry.publicSubmitterName || entry.submitterAlias || entry.submitterUsername || null
      }));
      const enrichedVideos = videos.map((video) => ({
        ...video,
        submitterAlias: video.submitterAlias || null,
        publicSubmitterName:
          video.publicSubmitterName ||
          video.submitterAlias ||
          video.submitter?.twitchUsername ||
          null
      }));

      res.json({
        standings: enrichedStandings,
        videos: enrichedVideos,
        cup
      });
    } catch (error) {
      logger.error('Error getting cup standings:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get cup standings' });
    }
  }
);

router.get('/stats/global', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const videoService = req.app.get('videoService');
    const bot = req.app.get('bot');

    const globalStats = await channelManager.getGlobalStats();
    const cacheStats = videoService ? videoService.getCacheStats() : null;
    const botStats = bot ? bot.getStats() : null;

    res.json({
      global: globalStats,
      cache: cacheStats,
      bot: botStats,
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error getting global stats:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get statistics' });
  }
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

router.use((error, req, res, next) => {
  logger.error('API Error:', error);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
});

module.exports = router;
