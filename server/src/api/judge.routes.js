const { body, param } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth, requireChannelRole } = require('../auth/middleware');
const { authenticateJudgeToken } = require('../auth/judgeToken');

module.exports = (router, { helpers }) => {
  const { getChannelManager, requireChannelOwnership, getQueueServiceOrThrow, validate } = helpers;

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

         // Require an active session before scoring
         const activeSession = await channelManager.prisma.judgeSession.findUnique({
           where: {
             cupId_judgeTokenId: { cupId: req.judgeAuth.cupId, judgeTokenId: req.judgeAuth.judgeId }
           }
         });
         if (!activeSession || activeSession.status !== 'ACTIVE') {
           return res.status(401).json({ error: 'Judge session not active' });
         }

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

  router.post('/channels/:channelId/cups/:cupId/items/:itemId/gong',
    authenticateJudgeToken,
    [
      param('itemId').isInt().withMessage('Valid item ID is required'),
      body('active').optional().isBoolean().withMessage('Active must be a boolean')
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const queueService = getQueueServiceOrThrow(channelManager, req.judgeAuth.channelId);
        const itemId = parseInt(req.params.itemId, 10);
        const active = req.body?.active !== false;
        const gongState = queueService.setJudgeGong(itemId, req.judgeAuth.judgeId, req.judgeAuth.judgeName, active);
        res.json({ gongState });
      } catch (error) {
        logger.error('Error updating judge gong:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to update gong' });
      }
    }
  );

  router.post('/channels/:channelId/cups/:cupId/items/:itemId/golden-buzzer',
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
        const result = await judgeService.activateGoldenBuzzer(
          req.judgeAuth.cupId,
          itemId,
          req.judgeAuth.judgeId,
          req.judgeAuth.judgeName
        );

        // Hype it up in chat; never let the announcement fail the buzzer
        try {
          const bot = req.app.get('bot');
          if (bot && bot.isConnected()) {
            const judgeName = result.activation?.judgeName || req.judgeAuth.judgeName || 'A judge';
            const videoTitle = result.activation?.queueItem?.title || 'this video';
            await bot.sendPersonalityMessage(`#${req.judgeAuth.channelId}`, `🌟 GOLDEN BUZZER! ${judgeName} just saved "${videoTitle}" — all judge scores overridden with a perfect 5.0!`, {
              intent: 'A judge just slammed their once-per-stream GOLDEN BUZZER, overriding every other judge and locking in a perfect 5.0 for this video. This is the biggest moment of the show — go absolutely over the top.',
              facts: { judgeName, videoTitle },
              mustInclude: [judgeName]
            });
          }
        } catch (chatError) {
          logger.warn('Failed to announce golden buzzer in chat:', chatError);
        }

        res.json({ result });
      } catch (error) {
        logger.error('Error activating golden buzzer:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to activate golden buzzer' });
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

  router.post('/channels/:channelId/queue/gong',
    requireAuth,
    requireChannelRole(['OWNER']),
    [
      body('itemId').isInt().withMessage('Active queue item ID is required'),
      body('active').optional().isBoolean().withMessage('Active must be a boolean')
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
        const itemId = parseInt(req.body.itemId, 10);
        const active = req.body?.active !== false;
        const displayName = req.user?.displayName || req.user?.username || 'Owner';
        const gongState = queueService.setOwnerGong(itemId, req.user.id, displayName, active);
        res.json({ gongState });
      } catch (error) {
        logger.error('Error updating owner gong:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to update gong' });
      }
    }
  );

  router.delete('/channels/:channelId/cups/:cupId/items/:itemId/gongs/:participantId',
    requireAuth,
    requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER', 'HOST']),
    [
      param('itemId').isInt().withMessage('Valid item ID is required'),
      param('participantId').isString().notEmpty().withMessage('Participant ID is required')
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);
        const itemId = parseInt(req.params.itemId, 10);
        const participantId = req.params.participantId;
        const gongState = queueService.clearGong(itemId, participantId);
        res.json({ gongState });
      } catch (error) {
        logger.error('Error clearing gong:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to clear gong' });
      }
    }
  );
};
