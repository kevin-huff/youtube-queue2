const { body } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth } = require('../auth/middleware');

module.exports = (router, { helpers }) => {
  const { getChannelManager, requireChannelOwnership, getQueueServiceOrThrow, validate } = helpers;

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

      const { standings, videos, cup, seriesStandings } = await channelManager.rebuildCupStandings(normalizedChannelId, cupId);
        const enrichedStandings = standings.map((entry) => ({
          ...entry,
          publicSubmitterName: entry.publicSubmitterName || entry.submitterUsername || null
        }));
        const enrichedVideos = videos.map((video) => ({
          ...video,
          publicSubmitterName: video.publicSubmitterName || video.submitterUsername || null
        }));

      res.json({
        standings: enrichedStandings,
        videos: enrichedVideos,
        cup,
        series: seriesStandings || null
      });
    } catch (error) {
      logger.error('Error getting public cup standings:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get standings' });
    }
  });

  router.get('/channels/public/:channelName/series/current', async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = req.params.channelName.toLowerCase();

      const channel = await channelManager.getChannelInfo(normalizedChannelId);
      if (!channel || !channel.isActive) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const findSeriesByStatuses = async (statuses) => channelManager.prisma.series.findFirst({
        where: {
          channelId: normalizedChannelId,
          status: { in: statuses }
        },
        orderBy: [
          { startsAt: 'desc' },
          { createdAt: 'desc' }
        ],
        select: { id: true }
      });

      let seriesRecord = await findSeriesByStatuses(['ACTIVE']);
      if (!seriesRecord) {
        seriesRecord = await findSeriesByStatuses(['COMPLETED']);
      }

      if (!seriesRecord) {
        return res.status(404).json({ error: 'No series found' });
      }

      const snapshot = await channelManager.getSeriesStandingsSnapshot(normalizedChannelId, seriesRecord.id);
      res.json(snapshot);
    } catch (error) {
      logger.error('Error getting current series standings:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get series standings' });
    }
  });

  router.get('/channels/public/:channelName/series/:seriesParam/standings', async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const normalizedChannelId = req.params.channelName.toLowerCase();

      const channel = await channelManager.getChannelInfo(normalizedChannelId);
      if (!channel || !channel.isActive) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const rawSeriesParam = req.params.seriesParam;
      const normalizedSeriesSlug = rawSeriesParam.toLowerCase();

      const seriesRecord = await channelManager.prisma.series.findFirst({
        where: {
          channelId: normalizedChannelId,
          OR: [
            { id: rawSeriesParam },
            { slug: normalizedSeriesSlug }
          ]
        },
        select: { id: true }
      });

      if (!seriesRecord) {
        return res.status(404).json({ error: 'Series not found' });
      }

      const snapshot = await channelManager.getSeriesStandingsSnapshot(normalizedChannelId, seriesRecord.id);
      res.json(snapshot);
    } catch (error) {
      logger.error('Error getting series standings:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get series standings' });
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
        } catch (err) {
          logger.warn('Failed to aggregate cup baselines for social scoring', { error: err?.message });
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
};
