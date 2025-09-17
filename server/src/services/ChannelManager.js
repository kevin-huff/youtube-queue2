const { PrismaClient } = require('@prisma/client');
const QueueService = require('./QueueService');
const logger = require('../utils/logger');

class ChannelManager {
  constructor(io) {
    this.prisma = new PrismaClient();
    this.io = io;
    this.channels = new Map(); // channelId -> { queueService, settings, isActive }
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

      // Store channel instance
      this.channels.set(channelId, {
        queueService,
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

  async getUserChannels(accountId) {
    const ownerships = await this.prisma.channelOwner.findMany({
      where: { accountId },
      select: { channelId: true },
      orderBy: { createdAt: 'asc' }
    });

    return ownerships.map((ownership) => ownership.channelId);
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
          settings: {
            queue_enabled: false,
            max_queue_size: 50,
            submission_cooldown: 30,
            max_video_duration: 600,
            auto_play_next: true,
            current_volume: 75
          }
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
      // Update database
      await this.prisma.channel.update({
        where: { id: channelId },
        data: { settings }
      });

      // Update in-memory settings
      if (this.channels.has(channelId)) {
        this.channels.get(channelId).settings = settings;
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
        settings: channel.settings,
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
