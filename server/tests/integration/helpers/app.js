const express = require('express');
const apiRouter = require('../../../src/api');

/**
 * Build an Express app wired with the real API router but using
 * lightweight stubs for auth and ChannelManager that still hit Prisma.
 */
const buildTestApp = ({
  prisma,
  user = null,
  queueChannelId = null,
  queueService: providedQueueService = null,
  judgeServices = {},
  includeHealth = false,
  adService = null
} = {}) => {
  const app = express();
  app.use(express.json());

  // Minimal auth stub
  app.use((req, res, next) => {
    req.isAuthenticated = () => Boolean(user);
    if (user) {
      req.user = user;
      req.session = req.session || {};
    }
    next();
  });

  // Simple queue service that reads from Prisma for the given channel
  const resolvedChannelId = queueChannelId || providedQueueService?.channelId || (user?.channels?.[0]?.id) || 'test_channel';
  const queueService =
    providedQueueService ||
    {
      channelId: resolvedChannelId,
      currentlyPlaying: null,
      async getCurrentQueue() {
        return prisma.queueItem.findMany({
          where: { channelId: this.channelId },
          orderBy: { position: 'asc' }
        });
      }
    };
  queueService.channelId = queueService.channelId || resolvedChannelId;

  const channelManager = {
    prisma,
    async getChannelInfo(id) {
      return prisma.channel.findUnique({ where: { id: id.toLowerCase() } });
    },
    getChannelInstance() {
      return { queueService };
    },
    getQueueService(requestedId) {
      const target = (requestedId || queueService.channelId || '').toLowerCase();
      if (target !== (queueService.channelId || '').toLowerCase()) {
        return null;
      }
      return queueService;
    },
    getJudgeService(channelId) {
      return judgeServices[channelId] || null;
    },
    async getUserChannels(accountId) {
      const rows = await prisma.channelOwner.findMany({
        where: { accountId },
        select: { channelId: true }
      });
      return rows.map((r) => r.channelId);
    },
    async addChannel(rawChannelId, accountId) {
      const id = rawChannelId.toLowerCase();
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      if (!account) throw new Error('Account not found');

      const channel = await prisma.channel.upsert({
        where: { id },
        update: { isActive: true },
        create: {
          id,
          displayName: rawChannelId,
          isActive: true,
          settings: {}
        }
      });

      await prisma.channelOwner.upsert({
        where: { accountId_channelId: { accountId, channelId: id } },
        update: {},
        create: { accountId, channelId: id, role: 'OWNER' }
      });

      return channel;
    },
    async removeChannel(rawChannelId, accountId) {
      const id = rawChannelId.toLowerCase();
      await prisma.channelOwner.deleteMany({
        where: { accountId, channelId: id }
      });
      const remainingOwners = await prisma.channelOwner.count({ where: { channelId: id } });
      if (remainingOwners === 0) {
        await prisma.channel.updateMany({
          where: { id },
          data: { isActive: false }
        });
      }
      return true;
    },
    getActiveChannels() {
      return [];
    }
  };

  app.set('channelManager', channelManager);
  app.set('adEventService', adService || { enabled: false });

  if (includeHealth) {
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        bot: false,
        channels: channelManager ? channelManager.getActiveChannels().length : 0
      });
    });
  }

  app.use('/api', apiRouter);
  return { app, channelManager, queueService };
};

module.exports = { buildTestApp };
