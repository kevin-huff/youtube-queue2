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
  max_per_user: 3
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

  const standingsAccumulator = new Map();

  videos
    .filter((video) => typeof video.averageScore === 'number')
    .forEach((video) => {
      const existing = standingsAccumulator.get(video.submitterUsername) || {
        submitterUsername: video.submitterUsername,
        submitterAlias: video.submitterAlias || null,
        videoScores: [], // Store all video scores
        totalJudgeCount: 0,
        videoCount: 0
      };

      if (!existing.submitterAlias && video.submitterAlias) {
        existing.submitterAlias = video.submitterAlias;
      }

      existing.videoScores.push(video.averageScore);
      existing.totalJudgeCount += video.judgeCount;
      existing.videoCount += 1;

      standingsAccumulator.set(video.submitterUsername, existing);
    });

  // Helper function to calculate median
  const calculateMedian = (scores) => {
    if (scores.length === 0) return null;
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  };

  const standings = Array.from(standingsAccumulator.values())
    .map((entry) => {
      // Take best N (up to 5) videos by score
      const bestScores = [...entry.videoScores]
        .sort((a, b) => b - a)
        .slice(0, 5);
      
      // Calculate median of best scores as social score
      const socialScore = calculateMedian(bestScores);
      
      // Keep totalScore for compatibility (sum of all videos)
      const totalScore = entry.videoScores.reduce((sum, score) => sum + score, 0);

      return {
        submitterUsername: entry.submitterUsername,
        submitterAlias: entry.submitterAlias || null,
        totalScore: Number(totalScore.toFixed(5)),
        averageScore: socialScore !== null ? Number(socialScore.toFixed(5)) : null,
        judgeCount: entry.totalJudgeCount,
        videoCount: entry.videoCount
      };
    })
    .sort((a, b) => {
      // Sort by averageScore (which is now the median of best 5)
      if (b.averageScore !== a.averageScore) {
        return (b.averageScore ?? 0) - (a.averageScore ?? 0);
      }
      // Tiebreaker: more videos wins
      if (b.videoCount !== a.videoCount) {
        return b.videoCount - a.videoCount;
      }
      // Final tiebreaker: more total judge votes
      return (b.judgeCount ?? 0) - (a.judgeCount ?? 0);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

  return {
    videos,
    standings
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

    const [queueItems, cupRecord] = await Promise.all([
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
      })
    ]);

    const { videos, standings } = buildCupScoreData(queueItems);

    await this.prisma.$transaction([
      this.prisma.cupStanding.deleteMany({
        where: { cupId }
      }),
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

    const enhancedVideos = videos.map((video) => ({
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
