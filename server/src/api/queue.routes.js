const { body, param } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth, requireChannelRole } = require('../auth/middleware');

module.exports = (router, { helpers }) => {
  const { getChannelManager, requireChannelOwnership, getQueueServiceOrThrow, validate, SUBMITTER_FIELDS } = helpers;

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
};
