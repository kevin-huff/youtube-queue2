const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');

class QueueService {
  constructor(io) {
    this.db = null;
    this.io = io;
    this.currentlyPlaying = null;
    this.settings = new Map();
  }

  async initialize() {
    this.db = getDatabase();
    await this.loadSettings();
    await this.cleanupOldItems();
    logger.info('QueueService initialized');
  }

  async loadSettings() {
    try {
      const settings = await this.db.botSetting.findMany();
      settings.forEach(setting => {
        this.settings.set(setting.key, setting.value);
      });
      logger.info('Bot settings loaded');
    } catch (error) {
      logger.error('Failed to load settings:', error);
      throw error;
    }
  }

  async getSetting(key, defaultValue = null) {
    if (this.settings.has(key)) {
      return this.settings.get(key);
    }
    return defaultValue;
  }

  async updateSetting(key, value) {
    try {
      await this.db.botSetting.upsert({
        where: { key },
        update: { value: value.toString() },
        create: { key, value: value.toString() }
      });
      
      this.settings.set(key, value.toString());
      this.io.emit('setting:updated', { key, value });
      logger.info(`Setting updated: ${key} = ${value}`);
    } catch (error) {
      logger.error(`Failed to update setting ${key}:`, error);
      throw error;
    }
  }

  async isQueueEnabled() {
    const enabled = await this.getSetting('queue_enabled', 'false');
    return enabled === 'true';
  }

  async enableQueue(enabled = true) {
    await this.updateSetting('queue_enabled', enabled);
    this.io.emit('queue:status_changed', { enabled });
    logger.info(`Queue ${enabled ? 'enabled' : 'disabled'}`);
  }

  async addToQueue(videoData, submitter) {
    try {
      // Check if queue is enabled
      if (!(await this.isQueueEnabled())) {
        throw new Error('Queue is currently disabled');
      }

      // Check queue size limit
      const maxSize = parseInt(await this.getSetting('max_queue_size', '50'));
      const currentSize = await this.getQueueSize();
      
      if (currentSize >= maxSize) {
        throw new Error(`Queue is full (max ${maxSize} items)`);
      }

      // Check user cooldown
      await this.checkSubmissionCooldown(submitter);

      // Check if video already exists in queue
      const existingVideo = await this.db.queueItem.findFirst({
        where: {
          videoId: videoData.videoId,
          status: { in: ['PENDING', 'PLAYING'] }
        }
      });

      if (existingVideo) {
        throw new Error('This video is already in the queue');
      }

      // Get next position
      const nextPosition = await this.getNextPosition();

      // Create user if not exists
      await this.db.user.upsert({
        where: { twitchUsername: submitter },
        update: { 
          submissionCount: { increment: 1 },
          lastSubmission: new Date()
        },
        create: { 
          twitchUsername: submitter,
          submissionCount: 1,
          lastSubmission: new Date()
        }
      });

      // Add to queue
      const queueItem = await this.db.queueItem.create({
        data: {
          videoUrl: videoData.url,
          videoId: videoData.videoId,
          platform: videoData.platform,
          title: videoData.title,
          thumbnailUrl: videoData.thumbnail,
          duration: videoData.duration,
          submitterUsername: submitter,
          position: nextPosition,
          status: 'PENDING'
        },
        include: {
          submitter: {
            select: {
              twitchUsername: true,
              role: true
            }
          }
        }
      });

      // Log submission
      await this.logSubmission(submitter, 'ADD_VIDEO', {
        videoId: videoData.videoId,
        title: videoData.title,
        platform: videoData.platform
      });

      // Emit to all clients
      this.io.emit('queue:video_added', queueItem);

      logger.info(`Video added to queue: ${videoData.title} by ${submitter}`);
      return queueItem;
    } catch (error) {
      logger.error('Failed to add video to queue:', error);
      throw error;
    }
  }

  async removeFromQueue(itemId, removedBy = 'system') {
    try {
      const item = await this.db.queueItem.findUnique({
        where: { id: itemId },
        include: { submitter: true }
      });

      if (!item) {
        throw new Error('Queue item not found');
      }

      // Update item status
      await this.db.queueItem.update({
        where: { id: itemId },
        data: {
          status: 'REMOVED',
          playedAt: new Date()
        }
      });

      // Reorder remaining items
      await this.reorderQueue();

      // Log removal
      await this.logSubmission(removedBy, 'REMOVE_VIDEO', {
        videoId: item.videoId,
        title: item.title,
        originalSubmitter: item.submitterUsername
      });

      // Emit to all clients
      this.io.emit('queue:video_removed', { id: itemId });

      logger.info(`Video removed from queue: ${item.title} by ${removedBy}`);
      return true;
    } catch (error) {
      logger.error('Failed to remove video from queue:', error);
      throw error;
    }
  }

  async getCurrentQueue() {
    try {
      const queue = await this.db.queueItem.findMany({
        where: {
          status: { in: ['PENDING', 'PLAYING'] }
        },
        include: {
          submitter: {
            select: {
              twitchUsername: true,
              role: true
            }
          }
        },
        orderBy: { position: 'asc' }
      });

      return queue;
    } catch (error) {
      logger.error('Failed to get current queue:', error);
      throw error;
    }
  }

  async getNextVideo() {
    try {
      const nextVideo = await this.db.queueItem.findFirst({
        where: { status: 'PENDING' },
        include: {
          submitter: {
            select: {
              twitchUsername: true,
              role: true
            }
          }
        },
        orderBy: { position: 'asc' }
      });

      return nextVideo;
    } catch (error) {
      logger.error('Failed to get next video:', error);
      throw error;
    }
  }

  async playNext() {
    try {
      const nextVideo = await this.getNextVideo();
      
      if (!nextVideo) {
        this.currentlyPlaying = null;
        this.io.emit('queue:now_playing', null);
        return null;
      }

      // Mark current video as playing
      await this.db.queueItem.update({
        where: { id: nextVideo.id },
        data: {
          status: 'PLAYING',
          playedAt: new Date()
        }
      });

      this.currentlyPlaying = nextVideo;
      this.io.emit('queue:now_playing', nextVideo);

      logger.info(`Now playing: ${nextVideo.title}`);
      return nextVideo;
    } catch (error) {
      logger.error('Failed to play next video:', error);
      throw error;
    }
  }

  async skipCurrent(skippedBy = 'system') {
    try {
      if (!this.currentlyPlaying) {
        throw new Error('No video currently playing');
      }

      // Mark as skipped
      await this.db.queueItem.update({
        where: { id: this.currentlyPlaying.id },
        data: { status: 'SKIPPED' }
      });

      // Log skip
      await this.logSubmission(skippedBy, 'SKIP_VIDEO', {
        videoId: this.currentlyPlaying.videoId,
        title: this.currentlyPlaying.title
      });

      // Play next video
      const nextVideo = await this.playNext();

      logger.info(`Video skipped: ${this.currentlyPlaying.title} by ${skippedBy}`);
      return nextVideo;
    } catch (error) {
      logger.error('Failed to skip current video:', error);
      throw error;
    }
  }

  async markAsPlayed(itemId) {
    try {
      await this.db.queueItem.update({
        where: { id: itemId },
        data: { status: 'PLAYED' }
      });

      // Auto-play next if enabled
      const autoPlay = await this.getSetting('auto_play_next', 'true');
      if (autoPlay === 'true') {
        await this.playNext();
      } else {
        this.currentlyPlaying = null;
        this.io.emit('queue:now_playing', null);
      }

      logger.info(`Video marked as played: ${itemId}`);
    } catch (error) {
      logger.error('Failed to mark video as played:', error);
      throw error;
    }
  }

  async clearQueue(clearedBy = 'system') {
    try {
      await this.db.queueItem.updateMany({
        where: {
          status: { in: ['PENDING', 'PLAYING'] }
        },
        data: { status: 'REMOVED' }
      });

      this.currentlyPlaying = null;

      // Log clear
      await this.logSubmission(clearedBy, 'CLEAR_QUEUE', {});

      // Emit to all clients
      this.io.emit('queue:cleared');

      logger.info(`Queue cleared by ${clearedBy}`);
    } catch (error) {
      logger.error('Failed to clear queue:', error);
      throw error;
    }
  }

  async reorderQueue(newOrder = null) {
    try {
      if (newOrder) {
        // Reorder based on provided order
        for (let i = 0; i < newOrder.length; i++) {
          await this.db.queueItem.update({
            where: { id: newOrder[i].id },
            data: { position: i + 1 }
          });
        }
      } else {
        // Auto-reorder remaining items
        const pendingItems = await this.db.queueItem.findMany({
          where: { status: 'PENDING' },
          orderBy: { position: 'asc' }
        });

        for (let i = 0; i < pendingItems.length; i++) {
          await this.db.queueItem.update({
            where: { id: pendingItems[i].id },
            data: { position: i + 1 }
          });
        }
      }

      // Emit updated queue
      const updatedQueue = await this.getCurrentQueue();
      this.io.emit('queue:updated', updatedQueue);

      logger.info('Queue reordered');
    } catch (error) {
      logger.error('Failed to reorder queue:', error);
      throw error;
    }
  }

  // Helper methods
  async getQueueSize() {
    return await this.db.queueItem.count({
      where: {
        status: { in: ['PENDING', 'PLAYING'] }
      }
    });
  }

  async getNextPosition() {
    const lastItem = await this.db.queueItem.findFirst({
      where: {
        status: { in: ['PENDING', 'PLAYING'] }
      },
      orderBy: { position: 'desc' }
    });

    return lastItem ? lastItem.position + 1 : 1;
  }

  async checkSubmissionCooldown(username) {
    const cooldownSeconds = parseInt(await this.getSetting('submission_cooldown', '30'));
    
    if (cooldownSeconds <= 0) return;

    const user = await this.db.user.findUnique({
      where: { twitchUsername: username }
    });

    if (user && user.lastSubmission) {
      const timeDiff = (Date.now() - user.lastSubmission.getTime()) / 1000;
      if (timeDiff < cooldownSeconds) {
        const remaining = Math.ceil(cooldownSeconds - timeDiff);
        throw new Error(`Please wait ${remaining} seconds before submitting another video`);
      }
    }
  }

  async logSubmission(username, action, details = {}) {
    try {
      await this.db.submissionLog.create({
        data: {
          username,
          action,
          details
        }
      });
    } catch (error) {
      logger.error('Failed to log submission:', error);
    }
  }

  async cleanupOldItems() {
    try {
      // Remove old played/skipped items (older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      await this.db.queueItem.deleteMany({
        where: {
          status: { in: ['PLAYED', 'SKIPPED', 'REMOVED'] },
          playedAt: {
            lt: sevenDaysAgo
          }
        }
      });

      logger.info('Old queue items cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup old items:', error);
    }
  }
}

module.exports = QueueService;
