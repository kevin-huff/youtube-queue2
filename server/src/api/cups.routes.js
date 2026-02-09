const { body } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth, requireChannelRole } = require('../auth/middleware');
const { generateJudgeToken } = require('../auth/judgeToken');

module.exports = (router, { helpers }) => {
  const { getChannelManager, requireChannelOwnership, validate, SUBMITTER_FIELDS } = helpers;

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
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();

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
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();

        const cups = await channelManager.prisma.cup.findMany({
          where: { channelId: normalizedChannelId },
          orderBy: { createdAt: 'desc' },
          include: {
            series: {
              select: {
                id: true,
                title: true,
                status: true,
                slug: true,
                startsAt: true
              }
            },
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

  // Series management
  router.get('/channels/:channelId/series',
    requireAuth,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();

        const series = await channelManager.prisma.series.findMany({
          where: { channelId: normalizedChannelId },
          orderBy: [
            { status: 'desc' },
            { startsAt: 'desc' },
            { createdAt: 'desc' }
          ],
          include: {
            _count: {
              select: {
                cups: true
              }
            }
          }
        });

        res.json({ series });
      } catch (error) {
        logger.error('Error getting series list:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to get series list' });
      }
    }
  );

  router.post('/channels/:channelId/series',
    requireAuth,
    requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER']),
    [
      body('title').notEmpty().withMessage('Series title is required'),
      body('slug').notEmpty().withMessage('Series slug is required')
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();

        const allowedStatuses = ['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];
        const requestedStatus = typeof req.body.status === 'string'
          ? req.body.status.toUpperCase()
          : null;
        const payload = {
          channelId: normalizedChannelId,
          title: req.body.title,
          slug: req.body.slug,
          description: req.body.description || null,
          status: allowedStatuses.includes(requestedStatus) ? requestedStatus : 'PLANNED',
          startsAt: req.body.startsAt ? new Date(req.body.startsAt) : null,
          endsAt: req.body.endsAt ? new Date(req.body.endsAt) : null,
          metadata: req.body.metadata || {}
        };

        const series = await channelManager.prisma.series.create({ data: payload });

        if (series.status === 'ACTIVE') {
          await channelManager.prisma.$transaction([
            channelManager.prisma.series.updateMany({
              where: {
                channelId: normalizedChannelId,
                NOT: { id: series.id },
                status: 'ACTIVE'
              },
              data: { status: 'COMPLETED' }
            })
          ]);
        }

        res.status(201).json({ series });
      } catch (error) {
        logger.error('Error creating series:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to create series' });
      }
    }
  );

  router.patch('/channels/:channelId/series/:seriesId',
    requireAuth,
    requireChannelRole(['OWNER', 'MANAGER', 'PRODUCER']),
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();
        const { seriesId } = req.params;

        const allowed = ['title', 'slug', 'description', 'startsAt', 'endsAt', 'status', 'metadata'];
        const data = {};
        allowed.forEach((field) => {
          if (req.body[field] !== undefined) {
            if (['startsAt', 'endsAt'].includes(field)) {
              data[field] = req.body[field] ? new Date(req.body[field]) : null;
            } else if (field === 'status' && typeof req.body[field] === 'string') {
              const normalized = req.body[field].toUpperCase();
              const allowedStatuses = ['PLANNED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];
              if (allowedStatuses.includes(normalized)) {
                data.status = normalized;
              }
            } else {
              data[field] = req.body[field];
            }
          }
        });

        if (Object.keys(data).length === 0) {
          return res.status(400).json({ error: 'No valid updates provided' });
        }

        let updated;
        if (data.status === 'ACTIVE') {
          // Wrap update + deactivation in a transaction to prevent race conditions
          const [updatedSeries] = await channelManager.prisma.$transaction([
            channelManager.prisma.series.update({
              where: {
                id: seriesId,
                channelId: normalizedChannelId
              },
              data
            }),
            channelManager.prisma.series.updateMany({
              where: {
                channelId: normalizedChannelId,
                NOT: { id: seriesId },
                status: 'ACTIVE'
              },
              data: { status: 'COMPLETED' }
            })
          ]);
          updated = updatedSeries;
        } else {
          updated = await channelManager.prisma.series.update({
            where: {
              id: seriesId,
              channelId: normalizedChannelId
            },
            data
          });
        }

        res.json({ series: updated });
      } catch (error) {
        logger.error('Error updating series:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to update series' });
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
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();
        const { cupId } = req.params;

        // Deactivate all cups and activate the target in a single transaction
        const [, cup] = await channelManager.prisma.$transaction([
          channelManager.prisma.cup.updateMany({
            where: { channelId: normalizedChannelId },
            data: { isActive: false }
          }),
          channelManager.prisma.cup.update({
            where: {
              id: cupId,
              channelId: normalizedChannelId
            },
            data: { isActive: true }
          })
        ]);

        try {
          const queueService = channelManager.getQueueService(normalizedChannelId);
          if (queueService?.io) {
            queueService.io.emit('setting:updated', { key: 'activeCupId', value: cup.id });
          }
        } catch (emitError) {
          logger.warn('Failed to broadcast active cup update', {
            channelId: normalizedChannelId,
            cupId,
            error: emitError?.message || emitError
          });
        }

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
        await requireChannelOwnership(channelManager, req.user.id, req.params.channelId);
        const normalizedChannelId = req.params.channelId.toLowerCase();
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
          publicSubmitterName: video.submitter?.twitchUsername || video.submitterUsername || null
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

  router.get('/channels/:channelId/cups/:cupId',
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

        const allowedUpdates = ['title', 'theme', 'status', 'startsAt', 'endsAt', 'metadata', 'seriesId'];
        const updates = {};

        for (const field of allowedUpdates) {
          if (req.body[field] !== undefined) {
            if (['startsAt', 'endsAt'].includes(field)) {
              updates[field] = req.body[field] ? new Date(req.body[field]) : null;
            } else if (field === 'seriesId') {
              updates.seriesId = req.body.seriesId || null;
            } else {
              updates[field] = req.body[field];
            }
          }
        }

        const cup = await channelManager.prisma.cup.update({
          where: {
            id: req.params.cupId,
            channelId: normalizedChannelId
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

        const queueItemId = parseInt(req.body.queueItemId, 10);
        const queueItem = await channelManager.prisma.queueItem.update({
          where: {
            id: queueItemId,
            channelId: normalizedChannelId
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
};
