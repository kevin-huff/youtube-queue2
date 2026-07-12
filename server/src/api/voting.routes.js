const { param } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth, requireChannelRole } = require('../auth/middleware');

module.exports = (router, { helpers }) => {
  const { getChannelManager, requireChannelOwnership, getQueueServiceOrThrow, validate, SUBMITTER_FIELDS } = helpers;

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

        const votingState = await queueService.advanceJudgeReveal();
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
        const queueService = getQueueServiceOrThrow(channelManager, normalizedChannelId);

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

        const { standings, videos, cup, seriesStandings } = await channelManager.rebuildCupStandings(normalizedChannelId, cupId);
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
          if (seriesStandings?.series?.id) {
            channelInstance.namespace.emit('series:standings_updated', {
              seriesId: seriesStandings.series.id,
              series: seriesStandings.series,
              standings: seriesStandings.standings || []
            });
          }
        }

        // Ensure overlays/clients remove the item from the active queue immediately
        try {
          // Remove from VIP list if present
          await queueService._removeVipEntry(itemId);
        } catch (err) { logger.warn('Failed to remove VIP entry after finalize', { error: err?.message }); }
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
          publicSubmitterName: updatedItem.submitter?.twitchUsername || updatedItem.submitterUsername || null
        };

        const enrichedVideos = videos.map((video) => ({
          ...video,
          publicSubmitterName:
            video.publicSubmitterName ||
            video.submitterUsername ||
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
          publicSubmitterName: entry.publicSubmitterName || entry.submitterUsername || null
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

        const { standings, videos, cup, seriesStandings } = await channelManager.rebuildCupStandings(normalizedChannelId, req.params.cupId);
        const enrichedStandings = standings.map((entry) => ({
          ...entry,
          publicSubmitterName: entry.publicSubmitterName || entry.submitterUsername || null
        }));
        const enrichedVideos = videos.map((video) => ({
          ...video,
          publicSubmitterName:
            video.publicSubmitterName ||
            video.submitterUsername ||
            video.submitter?.twitchUsername ||
            null
        }));

        res.json({
          standings: enrichedStandings,
          videos: enrichedVideos,
          cup,
          series: seriesStandings || null
        });
      } catch (error) {
        logger.error('Error getting cup standings:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to get cup standings' });
      }
    }
  );
};
