const express = require('express');
const passport = require('passport');
const { body, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth } = require('../auth/middleware');

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

// OAuth routes
router.get('/auth/twitch',
  passport.authenticate('twitch', { scope: ['user:read:email', 'channel:read:subscriptions'] })
);

router.get('/auth/twitch/callback',
  passport.authenticate('twitch', { failureRedirect: '/login?error=auth_failed' }),
  (req, res) => {
    const redirectUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${redirectUrl}/dashboard`);
  }
);

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

router.post('/channels/:channelId/queue/add', requireAuth, [
  body('url').isURL().withMessage('Valid URL is required'),
  body('submitter').notEmpty().withMessage('Submitter is required')
], validate, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const videoService = req.app.get('videoService');
    if (!videoService) {
      return res.status(500).json({ error: 'Video service not available' });
    }

    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const metadata = await videoService.getVideoMetadata(req.body.url);
    const queueItem = await queueService.addToQueue(metadata, req.body.submitter);

    res.status(201).json(queueItem);
  } catch (error) {
    logger.error('Error adding video to queue:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to add video to queue' });
  }
});

router.delete('/channels/:channelId/queue/:id', requireAuth, [
  param('id').isInt().withMessage('Valid item ID is required')
], validate, async (req, res) => {
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

router.post('/channels/:channelId/queue/skip', requireAuth, async (req, res) => {
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
});

router.post('/channels/:channelId/queue/clear', requireAuth, async (req, res) => {
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
});

// Channel settings
router.get('/channels/:channelId/settings', requireAuth, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    const settings = {
      queue_enabled: await queueService.getSetting('queue_enabled', 'false'),
      max_queue_size: await queueService.getSetting('max_queue_size', '50'),
      submission_cooldown: await queueService.getSetting('submission_cooldown', '30'),
      max_video_duration: await queueService.getSetting('max_video_duration', '600'),
      auto_play_next: await queueService.getSetting('auto_play_next', 'true'),
      current_volume: await queueService.getSetting('current_volume', '75')
    };

    res.json({ channelId: normalizedChannelId, settings });
  } catch (error) {
    logger.error('Error getting settings:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get settings' });
  }
});

router.put('/channels/:channelId/settings/:key', requireAuth, [
  param('key').notEmpty().withMessage('Setting key is required'),
  body('value').not().isEmpty().withMessage('Setting value is required')
], validate, async (req, res) => {
  try {
    const channelManager = getChannelManager(req);
    const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
    const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

    await queueService.updateSetting(req.params.key, req.body.value);

    res.json({
      success: true,
      channelId: normalizedChannelId,
      key: req.params.key,
      value: req.body.value
    });
  } catch (error) {
    logger.error('Error updating setting:', error);
    res.status(error.status || 400).json({ error: error.message || 'Failed to update setting' });
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
      const metadata = await videoService.getVideoMetadata(req.body.url);
      return res.json({ valid: true, metadata });
    } catch (error) {
      return res.json({ valid: false, error: error.message });
    }
  } catch (error) {
    logger.error('Error validating video:', error);
    res.status(500).json({ error: 'Failed to validate video' });
  }
});

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
