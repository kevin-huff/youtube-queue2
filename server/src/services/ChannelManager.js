const { PrismaClient, Prisma } = require('@prisma/client');
const QueueService = require('./QueueService');
const JudgeService = require('./JudgeService');
const logger = require('../utils/logger');

const DEFAULT_CHANNEL_SETTINGS = {
  queue_enabled: false,
  auto_play_next: false,
  current_volume: 75,
  max_queue_size: 0,
  submission_cooldown: 30,
  max_video_duration: 300,
  max_per_user: 3,
  // Ad announcement defaults
  ad_announcements_enabled: true,
  ad_warn_message: 'Heads up: ads will run in 30 seconds. BRB!',
  ad_start_message: 'Ad break starting now — see you after the ads!',
  ad_end_message: 'Ads are over — welcome back!'
};

const normalizeChannelSettings = (rawSettings = {}) => {
  const normalized = { ...DEFAULT_CHANNEL_SETTINGS };
  if (rawSettings && typeof rawSettings === 'object') {
    Object.entries(rawSettings).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        normalized[key] = value;
      }
    });
  }
  return normalized;
};

const buildCupScoreData = (queueItems) => {
  const videos = queueItems.map((item) => {
    const judgeScores = Array.isArray(item.judgeScores) ? item.judgeScores : [];
    const judgeCount = judgeScores.length;
    const submitterAlias = item.submitterAlias || null;
    const submitterUsername = item.submitter?.twitchUsername || item.submitterUsername;

    if (!judgeCount) {
    return {
      queueItemId: item.id,
      videoId: item.videoId,
      videoUrl: item.videoUrl,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      submitterUsername,
      submitterAlias,
      publicSubmitterName: submitterAlias || submitterUsername,
      status: item.status,
      judgeCount: 0,
      averageScore: null,
      totalScore: null,
      judgeScores: [],
      playedAt: item.playedAt,
      createdAt: item.createdAt
    };
    }

    const totalScore = judgeScores.reduce((sum, score) => sum + Number(score.score), 0);
    const averageScore = totalScore / judgeCount;

    return {
      queueItemId: item.id,
      videoId: item.videoId,
      videoUrl: item.videoUrl,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      submitterUsername,
      submitterAlias,
      publicSubmitterName: submitterAlias || submitterUsername,
      status: item.status,
      judgeCount,
      totalScore: Number(totalScore.toFixed(5)),
      averageScore: Number(averageScore.toFixed(5)),
      judgeScores: judgeScores.map(score => ({
        score: Number(score.score),
        judgeName: score.judgeName || score.judgeSession?.judgeName || 'Anonymous',
        comment: score.comment,
        isLocked: score.isLocked
      })),
      playedAt: item.playedAt,
      createdAt: item.createdAt
    };
  });

  // Initial return uses only videos; standings are built after duplicate penalties
  return {
    videos,
    standings: []
  };
};

class ChannelManager {
  constructor(io) {
    this.prisma = new PrismaClient();
    this.io = io;
    this.channels = new Map(); // channelId -> { queueService, judgeService, settings, isActive }
    this.activeChannels = new Set(); // Set of active channel IDs
    this.namespaceInitializer = null;
  }

  async initialize() {
    try {
      // Load all active channels from database
      const activeChannels = await this.prisma.channel.findMany({
        where: { isActive: true }
      });

      for (const channel of activeChannels) {
        await this.createChannelInstance(channel.id);
      }

      logger.info(`Initialized ChannelManager with ${activeChannels.length} active channels`);
    } catch (error) {
      logger.error('Error initializing ChannelManager:', error);
      throw error;
    }
  }

  async createChannelInstance(channelId) {
    try {
      // Get channel data from database
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId }
      });

      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      if (this.channels.has(channelId)) {
        return this.channels.get(channelId);
      }

      // Create or retrieve channel-specific socket namespace
      const namespacePath = `/channel/${channelId}`;
      const channelNamespace = this.io.of(namespacePath);

      if (typeof this.namespaceInitializer === 'function') {
        this.namespaceInitializer(channelId, channelNamespace);
      }

      // Create QueueService instance for this channel
      const queueService = new QueueService(channelNamespace, channelId);
      await queueService.initialize();

      // Create JudgeService instance for this channel
      const judgeService = new JudgeService(channelNamespace, channelId);
      await judgeService.initialize();
      judgeService.bindQueueService(queueService);

      // Store channel instance
      this.channels.set(channelId, {
        queueService,
        judgeService,
        settings: channel.settings,
        isActive: channel.isActive,
        displayName: channel.displayName,
        namespace: channelNamespace
      });

      if (channel.isActive) {
        this.activeChannels.add(channelId);
      }

      logger.info(`Created channel instance for: ${channelId}`);
      return this.channels.get(channelId);
    } catch (error) {
      logger.error(`Error creating channel instance for ${channelId}:`, error);
      throw error;
    }
  }

  async activateChannel(channelId) {
    try {
      // Update database
      await this.prisma.channel.update({
        where: { id: channelId },
        data: { isActive: true }
      });

      // Create or reactivate channel instance
      if (!this.channels.has(channelId)) {
        await this.createChannelInstance(channelId);
      } else {
        const channelInstance = this.channels.get(channelId);
        channelInstance.isActive = true;
        this.activeChannels.add(channelId);
      }

      logger.info(`Activated channel: ${channelId}`);
      return true;
    } catch (error) {
      logger.error(`Error activating channel ${channelId}:`, error);
      throw error;
    }
  }

  async deactivateChannel(channelId) {
    try {
      // Update database
      await this.prisma.channel.update({
        where: { id: channelId },
        data: { isActive: false }
      });

      // Deactivate channel instance
      if (this.channels.has(channelId)) {
        const channelInstance = this.channels.get(channelId);
        channelInstance.isActive = false;
        this.activeChannels.delete(channelId);
      }

      logger.info(`Deactivated channel: ${channelId}`);
      return true;
    } catch (error) {
      logger.error(`Error deactivating channel ${channelId}:`, error);
      throw error;
    }
  }

  getChannelInstance(channelId) {
    return this.channels.get(channelId);
  }

  getQueueService(channelId) {
    const channelInstance = this.channels.get(channelId);
    return channelInstance?.queueService;
  }

  getJudgeService(channelId) {
    const channelInstance = this.channels.get(channelId);
    return channelInstance?.judgeService;
  }

  isChannelActive(channelId) {
    return this.activeChannels.has(channelId);
  }

  getActiveChannels() {
    return Array.from(this.activeChannels);
  }

  getAllChannels() {
    return Array.from(this.channels.keys());
  }

  setNamespaceInitializer(initializer) {
    this.namespaceInitializer = initializer;
  }

  async rebuildCupStandings(channelId, cupId) {
    const normalizedChannelId = channelId.toLowerCase();
    const [queueItems, cupRecord, allTerminal] = await Promise.all([
      this.prisma.queueItem.findMany({
        where: {
          channelId: normalizedChannelId,
          cupId,
          status: {
            in: ['SCORED', 'PLAYED']
          }
        },
        include: {
          judgeScores: true,
          submitter: {
            select: {
              twitchUsername: true
            }
          }
        },
        orderBy: [
          { playedAt: 'asc' },
          { createdAt: 'asc' }
        ]
      }),
      this.prisma.cup.findUnique({
        where: {
          id: cupId,
          channelId: normalizedChannelId
        },
        select: {
          id: true,
          title: true,
          theme: true,
          status: true
        }
      }),
      // Fetch terminal history across channel to determine previous runs per videoId
      this.prisma.queueItem.findMany({
        where: {
          channelId: normalizedChannelId,
          status: { in: ['SCORED', 'PLAYED', 'SKIPPED', 'REMOVED', 'REJECTED', 'ELIMINATED'] }
        },
        include: { judgeScores: true },
        orderBy: [
          { playedAt: 'asc' },
          { createdAt: 'asc' }
        ]
      })
    ]);

    const { videos } = buildCupScoreData(queueItems);

    // Build previous-average map per item (last prior run of same videoId)
    const byVideo = new Map();
    for (const item of allTerminal) {
      const arr = byVideo.get(item.videoId) || [];
      arr.push(item);
      byVideo.set(item.videoId, arr);
    }
    const prevAvgByItemId = new Map();
    for (const [videoId, items] of byVideo.entries()) {
      // items already sorted
      const averages = items.map((it) => {
        const scores = Array.isArray(it.judgeScores) ? it.judgeScores : [];
        if (!scores.length) return null;
        const total = scores.reduce((s, x) => s + Number(x.score), 0);
        return total / scores.length;
      });
      for (let i = 1; i < items.length; i += 1) {
        const prev = averages[i - 1];
        if (typeof prev === 'number') {
          prevAvgByItemId.set(items[i].id, Number(prev.toFixed(5)));
        }
      }
    }

    // Apply rule: if not strictly greater than previous average, force 0
    const penalizedVideos = videos.map((v) => {
      const prev = prevAvgByItemId.get(v.queueItemId);
      if (typeof v.averageScore === 'number' && typeof prev === 'number') {
        if (!(v.averageScore > prev)) {
          return { ...v, averageScore: 0, totalScore: 0 };
        }
      }
      return v;
    });

    // Build standings using shrunk top-K with cup baseline
    const DEFAULT_BASELINE = 3.4;
    const K = 5;
    const scoredValues = penalizedVideos
      .map((v) => (typeof v.averageScore === 'number' ? v.averageScore : null))
      .filter((n) => typeof n === 'number');
    const cupBaseline = scoredValues.length > 0
      ? (scoredValues.reduce((s, n) => s + n, 0) / scoredValues.length)
      : DEFAULT_BASELINE;

    const byUser = new Map();
    penalizedVideos
      .filter((v) => typeof v.averageScore === 'number')
      .forEach((v) => {
        const key = v.submitterUsername;
        const existing = byUser.get(key) || {
          submitterUsername: key,
          submitterAlias: v.submitterAlias || null,
          scores: [],
          totalJudgeCount: 0
        };
        if (!existing.submitterAlias && v.submitterAlias) {
          existing.submitterAlias = v.submitterAlias;
        }
        existing.scores.push(v.averageScore);
        existing.totalJudgeCount += (v.judgeCount || 0);
        byUser.set(key, existing);
      });

    const standings = Array.from(byUser.values())
      .map((entry) => {
        const sorted = entry.scores.slice().sort((a, b) => b - a);
        const n = Math.min(sorted.length, K);
        const sumTop = sorted.slice(0, n).reduce((s, x) => s + x, 0);
        const padded = (sumTop + (K - n) * cupBaseline) / K;
        const totalScore = entry.scores.reduce((s, x) => s + x, 0);
        return {
          submitterUsername: entry.submitterUsername,
          submitterAlias: entry.submitterAlias || null,
          totalScore: Number(totalScore.toFixed(5)),
          averageScore: Number(padded.toFixed(5)),
          judgeCount: entry.totalJudgeCount,
          videoCount: entry.scores.length
        };
      })
      .sort((a, b) => {
        if ((b.averageScore ?? 0) !== (a.averageScore ?? 0)) {
          return (b.averageScore ?? 0) - (a.averageScore ?? 0);
        }
        if ((b.videoCount || 0) !== (a.videoCount || 0)) {
          return (b.videoCount || 0) - (a.videoCount || 0);
        }
        return (b.judgeCount || 0) - (a.judgeCount || 0);
      })
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    await this.prisma.$transaction([
      this.prisma.cupStanding.deleteMany({ where: { cupId } }),
      ...standings.map((standing) => this.prisma.cupStanding.create({
        data: {
          cupId,
          channelId: normalizedChannelId,
          submitterUsername: standing.submitterUsername,
          totalScore: new Prisma.Decimal(standing.totalScore.toFixed(5)),
          averageScore: standing.averageScore !== null
            ? new Prisma.Decimal(standing.averageScore.toFixed(5))
            : null,
          judgeCount: standing.judgeCount,
          rank: standing.rank,
          metadata: {
            videoCount: standing.videoCount,
            updatedAt: new Date().toISOString()
          }
        }
      }))
    ]);

    const cupMetadata = cupRecord
      ? {
          id: cupRecord.id,
          title: cupRecord.title || null,
          theme: cupRecord.theme || null,
          status: cupRecord.status || null
        }
      : {
          id: cupId,
          title: null,
          theme: null,
          status: null
        };

    const enhancedStandings = standings.map((entry) => ({
      ...entry,
      cupId,
      cupTitle: cupMetadata.title,
      cupTheme: cupMetadata.theme
    }));

    const enhancedVideos = penalizedVideos.map((video) => ({
      ...video,
      cupId,
      cupTitle: cupMetadata.title,
      cupTheme: cupMetadata.theme
    }));

    return {
      cup: cupMetadata,
      standings: enhancedStandings,
      videos: enhancedVideos
    };
  }

  async getUserChannels(accountId, options = {}) {
    const {
      withRoles = false,
      includeExpired = false
    } = options;

    const now = new Date();
    const normalizeChannelId = (channelId) => channelId?.toLowerCase();

    const channelEntries = new Map();

    const ensureChannelEntry = (channelId, channelRecord = null) => {
      const normalizedId = normalizeChannelId(channelId);
      if (!normalizedId) {
        return null;
      }

      if (!channelEntries.has(normalizedId)) {
        channelEntries.set(normalizedId, {
          channelId: normalizedId,
          ownershipRole: null,
          roles: new Set(),
          cupRoles: new Map(),
          channel: channelRecord || null
        });
      } else if (channelRecord && !channelEntries.get(normalizedId).channel) {
        channelEntries.get(normalizedId).channel = channelRecord;
      }

      return channelEntries.get(normalizedId);
    };

    const ownerships = await this.prisma.channelOwner.findMany({
      where: { accountId },
      include: withRoles ? { channel: true } : undefined,
      orderBy: { createdAt: 'asc' }
    });

    ownerships.forEach((ownership) => {
      const entry = ensureChannelEntry(ownership.channelId, ownership.channel);
      if (!entry) {
        return;
      }
      entry.ownershipRole = ownership.role;
      if (ownership.role) {
        entry.roles.add(ownership.role);
      }
    });

    const roleAssignments = await this.prisma.channelRoleAssignment.findMany({
      where: {
        accountId,
        ...(includeExpired
          ? {}
          : {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } }
              ]
            })
      },
      include: withRoles ? { channel: true } : undefined,
      orderBy: { createdAt: 'asc' }
    });

    roleAssignments.forEach((assignment) => {
      const entry = ensureChannelEntry(assignment.channelId, assignment.channel);
      if (!entry) {
        return;
      }

      entry.roles.add(assignment.role);

      if (assignment.cupId) {
        const existing = entry.cupRoles.get(assignment.cupId) || new Set();
        existing.add(assignment.role);
        entry.cupRoles.set(assignment.cupId, existing);
      }
    });

    if (!withRoles) {
      return Array.from(channelEntries.keys());
    }

    return Array.from(channelEntries.values()).map((entry) => ({
      channelId: entry.channelId,
      ownershipRole: entry.ownershipRole,
      roles: Array.from(entry.roles),
      cupRoles: Array.from(entry.cupRoles.entries()).reduce((acc, [cupId, rolesSet]) => {
        acc[cupId] = Array.from(rolesSet);
        return acc;
      }, {}),
      channel: entry.channel
        ? {
            id: entry.channel.id,
            displayName: entry.channel.displayName,
            profileImageUrl: entry.channel.profileImageUrl,
            isActive: entry.channel.isActive
          }
        : null
    }));
  }

  async addChannel(rawChannelId, accountId) {
    const channelId = rawChannelId.toLowerCase();

    const account = await this.prisma.account.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new Error('Account not found');
    }

    let channel = await this.prisma.channel.findUnique({
      where: { id: channelId }
    });

    if (!channel) {
      channel = await this.prisma.channel.create({
        data: {
          id: channelId,
          displayName: channelId,
          settings: { ...DEFAULT_CHANNEL_SETTINGS }
        }
      });
    } else if (!channel.isActive) {
      channel = await this.prisma.channel.update({
        where: { id: channelId },
        data: { isActive: true }
      });
    }

    await this.prisma.channelOwner.upsert({
      where: {
        accountId_channelId: {
          accountId,
          channelId
        }
      },
      update: {},
      create: {
        accountId,
        channelId,
        role: 'OWNER'
      }
    });

    if (!this.channels.has(channelId)) {
      await this.createChannelInstance(channelId);
    }

    return this.getChannelInfo(channelId);
  }

  async removeChannel(rawChannelId, accountId) {
    const channelId = rawChannelId.toLowerCase();

    const ownership = await this.prisma.channelOwner.findUnique({
      where: {
        accountId_channelId: {
          accountId,
          channelId
        }
      }
    });

    if (!ownership) {
      throw new Error('Channel not found for this account');
    }

    await this.prisma.channelOwner.delete({
      where: {
        accountId_channelId: {
          accountId,
          channelId
        }
      }
    });

    const remainingOwners = await this.prisma.channelOwner.count({
      where: { channelId }
    });

    if (remainingOwners === 0) {
      await this.deactivateChannel(channelId);
    }

    return true;
  }

  async getChannelByName(channelName) {
    return this.prisma.channel.findUnique({
      where: { id: channelName.toLowerCase() }
    });
  }

  async updateChannelSettings(channelId, settings) {
    try {
      const mergedSettings = normalizeChannelSettings(settings);

      await this.prisma.channel.update({
        where: { id: channelId },
        data: { settings: mergedSettings }
      });

      // Update in-memory settings
      if (this.channels.has(channelId)) {
        this.channels.get(channelId).settings = mergedSettings;
      }

      logger.info(`Updated settings for channel: ${channelId}`);
      return true;
    } catch (error) {
      logger.error(`Error updating settings for channel ${channelId}:`, error);
      throw error;
    }
  }

  async getChannelSettings(channelId) {
    try {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { settings: true }
      });

      return channel?.settings || {};
    } catch (error) {
      logger.error(`Error getting settings for channel ${channelId}:`, error);
      return {};
    }
  }

  async getChannelInfo(channelId) {
    try {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId }
      });

      if (!channel) {
        return null;
      }

      const channelInstance = this.channels.get(channelId);
      const queueService = channelInstance?.queueService;

      return {
        id: channel.id,
        twitchUserId: channel.twitchUserId,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
        isActive: channel.isActive,
        settings: normalizeChannelSettings(channel.settings),
        queueStats: queueService ? {
          size: await queueService.getQueueSize(),
          enabled: await queueService.isQueueEnabled(),
          currentlyPlaying: queueService.currentlyPlaying ? true : false
        } : null
      };
    } catch (error) {
      logger.error(`Error getting channel info for ${channelId}:`, error);
      return null;
    }
  }

  // Get statistics for all channels
  async getGlobalStats() {
    try {
      const totalChannels = this.channels.size;
      const activeChannels = this.activeChannels.size;
      
      let totalQueueItems = 0;
      let activeQueues = 0;

      for (const channelId of this.activeChannels) {
        const queueService = this.getQueueService(channelId);
        if (queueService) {
          totalQueueItems += await queueService.getQueueSize();
          if (await queueService.isQueueEnabled()) {
            activeQueues++;
          }
        }
      }

      return {
        totalChannels,
        activeChannels,
        totalQueueItems,
        activeQueues,
        uptime: process.uptime(),
        timestamp: Date.now()
      };
    } catch (error) {
      logger.error('Error getting global stats:', error);
      return {
        totalChannels: 0,
        activeChannels: 0,
        totalQueueItems: 0,
        activeQueues: 0,
        uptime: process.uptime(),
        timestamp: Date.now()
      };
    }
  }

  async shutdown() {
    try {
      // Close all database connections
      await this.prisma.$disconnect();
      
      // Clear all channel instances
      this.channels.clear();
      this.activeChannels.clear();
      
      logger.info('ChannelManager shutdown complete');
    } catch (error) {
      logger.error('Error during ChannelManager shutdown:', error);
    }
  }
}

module.exports = ChannelManager;
