const path = require('path');
const fs = require('fs');
const { body, param } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth, requireChannelRole } = require('../auth/middleware');
const { authenticateJudgeToken } = require('../auth/judgeToken');

module.exports = (router, { helpers }) => {
  const {
    getChannelManager,
    requireChannelOwnership,
    getQueueServiceOrThrow,
    ensureOwnerOrManager,
    validate,
    UPLOADS_ROOT,
    upload,
    sbUpload
  } = helpers;

  // Run a multer middleware and translate its errors (e.g. rejected file
  // types) into JSON responses instead of falling through to the generic
  // 500 error handler.
  const runUpload = (uploadMiddleware) => (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return res.status(err.status || 400).json({ error: err.message || 'Upload failed' });
      }
      return next();
    });
  };

  // Helpers for soundboard storage in settings
  const getSoundboardItems = async (queueService) => {
    try {
      const raw = await queueService.getSetting('soundboard_items', '[]');
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      logger.warn('Failed to parse soundboard items from settings', { error: err?.message });
      return [];
    }
  };

  const setSoundboardItems = async (queueService, items) => {
    await queueService.updateSetting('soundboard_items', JSON.stringify(items || []));
  };

  // Only allow broadcasting URLs that are either stored soundboard items for
  // this channel or same-origin /uploads/ paths under THIS channel's own
  // directory (uploads are stored per-channel — see buildAudioUpload in
  // helpers.js). Anything else (external URLs, protocol-relative URLs,
  // traversal attempts, other channels' uploads) is rejected.
  const isAllowedSoundboardUrl = (url, items, channelId) => {
    if (typeof url !== 'string' || !url) return false;
    if ((items || []).some((it) => it && typeof it.url === 'string' && it.url === url)) return true;
    if (!channelId || !url.startsWith(`/uploads/${channelId}/`)) return false;
    if (url.includes('..') || url.includes('\\')) return false;
    return true;
  };

  const resolveSoundboardPayload = (req, items, channelId, { includeCallerMeta = false } = {}) => {
    if (req.body?.itemId) {
      const item = items.find((it) => it.id === req.body.itemId);
      if (!item) {
        return { error: { status: 404, message: 'Item not found' } };
      }
      return { payload: { id: item.id, name: item.name, url: item.url } };
    }
    if (req.body?.url) {
      const url = String(req.body.url);
      if (!isAllowedSoundboardUrl(url, items, channelId)) {
        return { error: { status: 400, message: 'URL not allowed: must be a stored soundboard item or one of this channel\'s /uploads/ paths' } };
      }
      return {
        payload: includeCallerMeta
          ? { id: req.body.id || null, name: req.body.name || 'Sound', url }
          : { id: null, name: 'Sound', url }
      };
    }
    return { error: { status: 400, message: 'itemId or url required' } };
  };

  // Channel settings
  router.get('/channels/:channelId/settings', requireAuth, async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
      const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
      const activeCup = await channelManager.prisma.cup.findFirst({
        where: {
          channelId: normalizedChannelId,
          isActive: true
        },
        select: {
          id: true
        }
      });

      const settings = {
        queue_enabled: await queueService.getSetting('queue_enabled', 'false'),
        max_queue_size: await queueService.getSetting('max_queue_size', '0'),
        submission_cooldown: await queueService.getSetting('submission_cooldown', '30'),
        max_video_duration: await queueService.getSetting('max_video_duration', '300'),
        auto_play_next: await queueService.getSetting('auto_play_next', 'false'),
        current_volume: await queueService.getSetting('current_volume', '75'),
        max_per_user: await queueService.getSetting('max_per_user', '3'),
        chat_voting_enabled: await queueService.getSetting('chat_voting_enabled', 'false'),
        shuffle_audio_url: await queueService.getSetting('shuffle_audio_url', ''),
        // Ad announcements
        ad_announcements_enabled: await queueService.getSetting('ad_announcements_enabled', 'true'),
        ad_warn_message: await queueService.getSetting('ad_warn_message', 'Heads up: ads will run in 30 seconds. BRB!'),
        ad_start_message: await queueService.getSetting('ad_start_message', 'Ad break starting now — see you after the ads!'),
        ad_end_message: await queueService.getSetting('ad_end_message', 'Ads are over — welcome back!'),
        activeCupId: activeCup?.id || null
      };

      res.json({ channelId: normalizedChannelId, settings });
    } catch (error) {
      logger.error('Error getting settings:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get settings' });
    }
  });

  // Next ad info (producer/owners)
  router.get('/channels/:channelId/ads/next', requireAuth, async (req, res) => {
    try {
      const adService = req.app.get('adEventService');
      if (!adService || !adService.enabled) {
        return res.status(503).json({ error: 'Ad service unavailable' });
      }
      const channelId = await requireChannelOwnership(getChannelManager(req), req.user.id, req.params.channelId);
      const result = await adService.getNextAdForChannel(channelId);
      try {
        logger.info('ads/next', {
          channelId,
          requester: req.user?.id || null,
          live: result?.live ?? null,
          nextAdAt: result?.nextAdAt || null,
          duration: typeof result?.duration === 'number' ? result.duration : null
        });
      } catch (err) { logger.warn('Failed to log ad next info', { error: err?.message }); }
      return res.json(result || { live: null, nextAdAt: null, duration: null });
    } catch (error) {
      logger.error('Error getting next ad info:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get next ad info' });
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
    runUpload(upload.single('file')),
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
        } catch (err) { logger.warn('Failed to log shuffle audio save details', { error: err?.message }); }
        logger.info(`Uploaded shuffle audio for ${normalizedChannelId}: ${publicUrl}`);
        return res.status(201).json({ url: publicRel, absoluteUrl: publicUrl, filename: req.file.filename, channelId: normalizedChannelId });
      } catch (error) {
        logger.error('Error uploading shuffle audio:', error);
        const status = error.status || 500;
        return res.status(status).json({ error: error.message || 'Upload failed' });
      }
    }
  );

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
  router.post('/channels/:channelId/soundboard/upload', requireAuth, requireChannelRole(['OWNER','MANAGER','PRODUCER']), runUpload(sbUpload.single('file')), async (req, res) => {
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
      } catch (err) { logger.warn('Failed to log soundboard item save details', { error: err?.message }); }
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
      } catch (err) { logger.warn('Failed to delete soundboard audio file', { error: err?.message }); }
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
      const { payload, error: payloadError } = resolveSoundboardPayload(req, items, channelId, { includeCallerMeta: true });
      if (payloadError) {
        return res.status(payloadError.status).json({ error: payloadError.message });
      }
      // Broadcast via channel namespace
      try {
        const sockets = await queueService.io.fetchSockets();
        logger.info(`Emitting soundboard:play to /channel/${channelId} (listeners=${sockets.length})`, payload);
      } catch (err) {
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
      const { payload, error: payloadError } = resolveSoundboardPayload(req, items, req.judgeAuth.channelId);
      if (payloadError) {
        return res.status(payloadError.status).json({ error: payloadError.message });
      }
      try {
        const sockets = await queueService.io.fetchSockets();
        logger.info(`(judge) Emitting soundboard:play to /channel/${req.judgeAuth.channelId} (listeners=${sockets.length})`, payload);
      } catch (err) {
        logger.info(`(judge) Emitting soundboard:play to /channel/${req.judgeAuth.channelId}`);
      }
      queueService.io.emit('soundboard:play', payload);
      res.json({ ok: true, payload });
    } catch (error) {
      logger.error('Error (judge) triggering soundboard play:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to play sound' });
    }
  });
};
