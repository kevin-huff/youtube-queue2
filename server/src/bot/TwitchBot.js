const tmi = require('tmi.js');
const logger = require('../utils/logger');
const VideoService = require('../services/VideoService');

// Base URL for public web app links (strip trailing slashes)
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

class TwitchBot {
  constructor(channelManager, io) {
    this.channelManager = channelManager;
    this.io = io;
    this.client = null;
    this.videoService = new VideoService();
    this.connected = false;
    this.rateLimiter = new Map(); // Track user rate limits per channel
    this.channelModerators = new Map(); // channelId -> Set of moderators
    this.channelBannedUsers = new Map(); // channelId -> Set of banned users
    this.pendingDuplicateConfirms = new Map(); // key: `${channelId}:${username}` -> { videoId, expiresAt }
    this._historicalIds = null; // lazy-loaded Set of historical YouTube IDs
    
    this.config = {
      options: {
        debug: process.env.NODE_ENV === 'development'
      },
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: process.env.TWITCH_BOT_USERNAME,
        password: process.env.TWITCH_BOT_OAUTH_TOKEN
      },
      channels: [] // Will be populated dynamically
    };
  }

  async initialize() {
    try {
      // Get initial channels from ChannelManager
      const activeChannels = this.channelManager.getActiveChannels();
      this.config.channels = activeChannels.map(channelId => `#${channelId}`);

      // Initialize per-channel state
      for (const channelId of activeChannels) {
        this.channelModerators.set(channelId, new Set());
        this.channelBannedUsers.set(channelId, new Set());
      }

      this.client = new tmi.Client(this.config);

      // Set up event listeners
      this.setupEventListeners();

      // Connect to Twitch
      await this.client.connect();
      this.connected = true;

      logger.info(`Twitch bot connected to ${activeChannels.length} channels: ${activeChannels.join(', ')}`);
    } catch (error) {
      logger.error('Failed to initialize Twitch bot:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Connection events
    this.client.on('connected', (address, port) => {
      logger.info(`Connected to Twitch IRC at ${address}:${port}`);
      this.io.emit('bot:status', { connected: true });
    });

    this.client.on('disconnected', (reason) => {
      logger.warn(`Disconnected from Twitch IRC: ${reason}`);
      this.connected = false;
      this.io.emit('bot:status', { connected: false });
    });

    this.client.on('reconnect', () => {
      logger.info('Reconnecting to Twitch IRC...');
    });

    // Chat events
    this.client.on('message', this.handleMessage.bind(this));
  // Cheer events (bits)
  this.client.on('cheer', this.handleCheer ? this.handleCheer.bind(this) : (_channel, _userstate, _message) => {});
    this.client.on('join', this.handleJoin.bind(this));
    this.client.on('part', this.handlePart.bind(this));

    // Moderation events
    this.client.on('mod', (channel, username) => {
      const channelId = channel.substring(1).toLowerCase();
      let channelModerators = this.channelModerators.get(channelId);
      if (!channelModerators) {
        channelModerators = new Set();
        this.channelModerators.set(channelId, channelModerators);
      }
      channelModerators.add(username.toLowerCase());
      logger.info(`${username} is now a moderator in ${channelId}`);
    });

    this.client.on('unmod', (channel, username) => {
      const channelId = channel.substring(1).toLowerCase();
      const channelModerators = this.channelModerators.get(channelId);
      if (channelModerators) {
        channelModerators.delete(username.toLowerCase());
      }
      logger.info(`${username} is no longer a moderator in ${channelId}`);
    });
  }

  async handleMessage(channel, userstate, message, self) {
    // Ignore messages from the bot itself
    if (self) return;

    // Extract channel name (remove # prefix)
    const channelId = channel.substring(1).toLowerCase();
    const username = userstate.username.toLowerCase();
    const displayName = userstate['display-name'] || username;
    const isModerator = userstate.mod || userstate.badges?.broadcaster;
    const _isSubscriber = userstate.subscriber;

    try {
      // Check if channel is active
      if (!this.channelManager.isChannelActive(channelId)) {
        return;
      }

      // Check if user is banned in this channel
      const channelBannedUsers = this.channelBannedUsers.get(channelId) || new Set();
      if (channelBannedUsers.has(username)) {
        return;
      }

      // Handle commands
      if (message.startsWith('!')) {
        await this.handleCommand(channel, channelId, userstate, message, isModerator);
        return;
      }

      // Check for video URLs in message
      await this.checkForVideoUrls(channel, channelId, username, message);
    } catch (error) {
      logger.error('Error handling message:', error);
      this.sendMessage(channel, `@${displayName} Sorry, there was an error processing your request.`);
    }
  }

  async handleCheer(channel, userstate, message) {
    // Handle bit cheers that include video links. Treat 500+ bits as VIP submission.
    try {
      const channelId = channel.substring(1).toLowerCase();
      const username = (userstate.username || '').toLowerCase();
      const _displayName = userstate['display-name'] || username;

      if (!this.channelManager.isChannelActive(channelId)) return;

      const bits = Number(userstate.bits || 0);
      if (!Number.isFinite(bits) || bits < 500) {
        return; // only interested in 500+ bit cheers for VIP
      }

      // Extract URLs from the cheer message
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = (message || '').match(urlRegex);
      if (!urls || !urls.length) return;

      const queueService = this.channelManager.getQueueService(channelId);
      if (!queueService) return;

      for (const url of urls) {
        try {
          if (!this.videoService.isValidVideoUrl(url)) continue;

          const maxVideoDuration = await queueService.getSetting('max_video_duration', '300');
          const metadata = await this.videoService.getVideoMetadata(url, {
            maxDuration: parseInt(maxVideoDuration, 10)
          });

          const result = await queueService.addToQueue(metadata, username);
          const added = result?.queueItem || null;

          if (added) {
            // Mark as VIP so it is played next (FIFO among VIPs) and excluded from shuffles
            await queueService.addVipForItem(added.id);

            this.sendMessage(channel, `@${username} Thank you for the ${bits} bits! Your video has been added as a VIP and will play next: ${metadata.title}`);
            this.applyRateLimit(`${channelId}:${username}`);
            break; // only process first valid URL
          }
        } catch (err) {
          logger.warn('Failed to process VIP cheer URL', { channelId, username, error: err });
          // notify user of failure
          this.sendMessage(channel, `@${username} Failed to add VIP video: ${err.message}`);
          break;
        }
      }
    } catch (error) {
      logger.error('Error handling cheer event:', error);
    }
  }

  async handleCommand(channel, channelId, userstate, message, isModerator) {
    const args = message.slice(1).split(' ');
    const command = args[0].toLowerCase();
    const username = userstate.username.toLowerCase();
    const displayName = userstate['display-name'] || username;

    switch (command) {
      case 'profile':
      case 'myscore':
      case 'myscores': {
        // Allow optional mention to fetch another user's profile link
        const rawTarget = (args[1] || username).toString();
        const cleanTarget = rawTarget.replace(/^@/, '').toLowerCase();
        const url = `${CLIENT_URL}/u/${encodeURIComponent(cleanTarget)}`;
        this.sendMessage(channel, `@${displayName} Profile link for ${cleanTarget}: ${url}`);
        break;
      }
      case 'queue':
        if (args[1]) {
          await this.handleQueueCommand(channel, channelId, userstate, args[1], isModerator);
        } else {
          await this.showQueueStatus(channel, channelId);
        }
        break;

      case 'skip':
        if (isModerator) {
          await this.handleSkipCommand(channel, channelId, username);
        } else {
          this.sendMessage(channel, `@${displayName} Only moderators can skip videos.`);
        }
        break;

      case 'clear':
        if (isModerator) {
          await this.handleClearCommand(channel, channelId, username);
        } else {
          this.sendMessage(channel, `@${displayName} Only moderators can clear the queue.`);
        }
        break;

      case 'volume':
        if (isModerator && args[1]) {
          await this.handleVolumeCommand(channel, channelId, args[1]);
        } else if (!isModerator) {
          this.sendMessage(channel, `@${displayName} Only moderators can change volume.`);
        } else {
          this.sendMessage(channel, `@${displayName} Usage: !volume <0-100>`);
        }
        break;

      // ads command removed; announcements handled via Twitch API

      case 'ban':
        if (isModerator && args[1]) {
          await this.handleBanCommand(channel, channelId, args[1]);
        } else if (!isModerator) {
          this.sendMessage(channel, `@${displayName} Only moderators can ban users.`);
        } else {
          this.sendMessage(channel, `@${displayName} Usage: !ban @username`);
        }
        break;

      case 'unban':
        if (isModerator && args[1]) {
          await this.handleUnbanCommand(channel, channelId, args[1]);
        } else if (!isModerator) {
          this.sendMessage(channel, `@${displayName} Only moderators can unban users.`);
        } else {
          this.sendMessage(channel, `@${displayName} Usage: !unban @username`);
        }
        break;

      case 'help':
        this.showHelp(channel, displayName, isModerator);
        break;

      default:
        // Unknown command - ignore silently
        break;
    }
  }

  async handleQueueCommand(channel, channelId, userstate, action, isModerator) {
    const displayName = userstate['display-name'] || userstate.username;

    if (!isModerator) {
      this.sendMessage(channel, `@${displayName} Only moderators can control the queue.`);
      return;
    }

    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      this.sendMessage(channel, 'Queue service not available for this channel.');
      return;
    }

    switch (action.toLowerCase()) {
      case 'on':
      case 'enable':
        await queueService.enableQueue(true);
        this.sendMessage(channel, 'Queue is now enabled! Drop your video links in chat!');
        break;

      case 'off':
      case 'disable':
        await queueService.enableQueue(false);
        this.sendMessage(channel, 'Queue is now disabled.');
        break;

      default:
        this.sendMessage(channel, `@${displayName} Usage: !queue on/off`);
        break;
    }
  }

  async showQueueStatus(channel, channelId) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      this.sendMessage(channel, 'Queue service not available for this channel.');
      return;
    }

    const isEnabled = await queueService.isQueueEnabled();
    const queueSize = await queueService.getQueueSize();
    const maxSize = await queueService.getSetting('max_queue_size', '50');
    
    const status = isEnabled ? 'enabled' : 'disabled';
    this.sendMessage(channel, `Queue is ${status} (${queueSize}/${maxSize} videos)`);
  }

  async handleSkipCommand(channel, channelId, username) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      this.sendMessage(channel, 'Queue service not available for this channel.');
      return;
    }

    try {
      const nextVideo = await queueService.skipCurrent(username);
      if (nextVideo) {
        this.sendMessage(channel, `Skipped! Now playing: ${nextVideo.title}`);
      } else {
        this.sendMessage(channel, 'Skipped! Queue is empty.');
      }
    } catch (error) {
      this.sendMessage(channel, `Error: ${error.message}`);
    }
  }

  async handleClearCommand(channel, channelId, username) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      this.sendMessage(channel, 'Queue service not available for this channel.');
      return;
    }

    try {
      await queueService.clearQueue(username);
      this.sendMessage(channel, 'Queue cleared!');
    } catch (error) {
      this.sendMessage(channel, `Error: ${error.message}`);
    }
  }

  async handleVolumeCommand(channel, channelId, volumeStr) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      this.sendMessage(channel, 'Queue service not available for this channel.');
      return;
    }

    const volume = parseInt(volumeStr);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      this.sendMessage(channel, 'Volume must be a number between 0 and 100.');
      return;
    }

    try {
      await queueService.updateSetting('current_volume', volume);
      this.sendMessage(channel, `Volume set to ${volume}%`);
    } catch (error) {
      this.sendMessage(channel, `Error setting volume: ${error.message}`);
    }
  }

  async handleBanCommand(channel, channelId, target) {
    const username = target.replace('@', '').toLowerCase();
    let channelBannedUsers = this.channelBannedUsers.get(channelId);
    if (!channelBannedUsers) {
      channelBannedUsers = new Set();
      this.channelBannedUsers.set(channelId, channelBannedUsers);
    }
    
    channelBannedUsers.add(username);
    this.sendMessage(channel, `${username} has been banned from submitting videos.`);
    
    // Log the ban
    const queueService = this.channelManager.getQueueService(channelId);
    if (queueService) {
      await queueService.logSubmission('system', 'BAN_USER', { username });
    }
  }

  async handleUnbanCommand(channel, channelId, target) {
    const username = target.replace('@', '').toLowerCase();
    const channelBannedUsers = this.channelBannedUsers.get(channelId);
    if (channelBannedUsers) {
      channelBannedUsers.delete(username);
    }
    
    this.sendMessage(channel, `${username} has been unbanned and can now submit videos.`);
    
    // Log the unban
    const queueService = this.channelManager.getQueueService(channelId);
    if (queueService) {
      await queueService.logSubmission('system', 'UNBAN_USER', { username });
    }
  }

  // ads command removed; announcements handled via Twitch API

  showHelp(channel, displayName, isModerator) {
    const helpMessages = [
      `@${displayName} Available commands:`
    ];

    if (isModerator) {
      helpMessages.push(
        '!profile or !myscore [@user] - Get profile link',
        '!queue on/off - Enable/disable queue',
        '!skip - Skip current video',
        '!clear - Clear entire queue',
        '!volume <0-100> - Set volume',
        '!ban @user - Ban user from submissions',
        '!unban @user - Unban user'
      );
    } else {
      helpMessages.push('!profile or !myscore - Get your profile link');
      helpMessages.push('Just drop YouTube/TikTok/Instagram links in chat when the queue is open!');
    }

    helpMessages.forEach(msg => this.sendMessage(channel, msg));
  }

  async checkForVideoUrls(channel, channelId, username, message) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      return;
    }

    // Check if queue is enabled
    if (!(await queueService.isQueueEnabled())) {
      return;
    }

    // Check rate limiting (per channel)
    const rateLimitKey = `${channelId}:${username}`;
    if (this.isRateLimited(rateLimitKey)) {
      return;
    }

    // Extract URLs from message
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.match(urlRegex);

    if (!urls) return;

    for (const url of urls) {
      try {
        // Check if it's a valid video URL
        if (!this.videoService.isValidVideoUrl(url)) {
          continue;
        }

        // Get channel's max video duration setting
        const maxVideoDuration = await queueService.getSetting('max_video_duration', '300');
        
        // Get video metadata with channel's max duration
        const metadata = await this.videoService.getVideoMetadata(url, {
          maxDuration: parseInt(maxVideoDuration, 10)
        });
        
        // Duplicate history detection (DB + historical file)
        const duplicateInfo = await queueService.getDuplicateInfo(metadata.videoId);
        const hasDbHistory = Boolean(duplicateInfo?.previousItem);
        const hasFileHistory = await this._hasHistoricalYouTubeId(metadata.videoId);
        const needsConfirm = hasDbHistory || hasFileHistory;
        const confirmKey = `${channelId}:${username}`;
        const now = Date.now();
        const pending = this.pendingDuplicateConfirms.get(confirmKey);
        
        if (needsConfirm) {
          const stillValid = pending && pending.videoId === metadata.videoId && pending.expiresAt > now;
          if (!stillValid) {
            // Ask user to submit again to confirm
            this.pendingDuplicateConfirms.set(confirmKey, {
              videoId: metadata.videoId,
              expiresAt: now + 2 * 60 * 1000 // 2 minutes
            });
            this.sendMessage(channel, `@${username} This video has already been rated before. To confirm, submit the same link again within 2 minutes. You must beat your previous run to keep your score.`);
            break; // don't add on first attempt
          }
        }

        // Add to queue
        const result = await queueService.addToQueue(metadata, username);

        // Clear confirmation record on success
        if (needsConfirm) {
          this.pendingDuplicateConfirms.delete(confirmKey);
        }

        // Do not reveal previous scores; just acknowledge
        const responseMessage = `@${username} Added to queue: ${metadata.title}`;
        this.sendMessage(channel, responseMessage);

        if (Array.isArray(result?.warnings)) {
          result.warnings.forEach((warning) => {
            if (warning?.message) {
              this.sendMessage(channel, `⚠️ ${warning.message}`);
            }
          });
        }
        
        // Apply rate limiting
        this.applyRateLimit(rateLimitKey);
        
        // Only process first valid URL per message
        break;
      } catch (error) {
        logger.warn(`Failed to process video URL ${url} from ${username}:`, error);
        this.sendMessage(channel, `@${username} ${error.message}`);
        break;
      }
    }
  }

  async _loadHistoricalYouTubeIds() {
    if (this._historicalIds) return this._historicalIds;
    try {
      const fs = require('fs');
      const path = require('path');
      // Try repo-root path then fallback
      const candidates = [
        path.resolve(process.cwd(), '../docs/historical_youtube.json'),
        path.resolve(process.cwd(), 'docs/historical_youtube.json'),
        path.join(__dirname, '../../../docs/historical_youtube.json')
      ];
      let filePath = null;
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          filePath = p;
          break;
        }
      }
      if (!filePath) {
        this._historicalIds = new Set();
        return this._historicalIds;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw || '{}');
      const ids = Object.keys(data || {});
      this._historicalIds = new Set(ids);
      return this._historicalIds;
    } catch (err) {
      logger.warn('Failed to load historical_youtube.json; proceeding without it', err);
      this._historicalIds = new Set();
      return this._historicalIds;
    }
  }

  async _hasHistoricalYouTubeId(videoId) {
    try {
      const set = await this._loadHistoricalYouTubeIds();
      return set.has(videoId);
    } catch (_) {
      return false;
    }
  }
  isRateLimited(key) {
    const now = Date.now();
    const userLimit = this.rateLimiter.get(key);
    
    if (!userLimit) return false;
    
    // Check if cooldown has passed
    const cooldown = 5000; // 5 seconds between submissions
    return (now - userLimit.lastSubmission) < cooldown;
  }

  applyRateLimit(key) {
    this.rateLimiter.set(key, {
      lastSubmission: Date.now()
    });
  }

  sendMessage(channel, message) {
    if (this.client && this.connected) {
      this.client.say(channel, message);
    }
  }

  handleJoin(channel, username, self) {
    if (self) {
      logger.info(`Joined channel: ${channel}`);
    }
  }

  handlePart(channel, username, self) {
    if (self) {
      logger.info(`Left channel: ${channel}`);
    }
  }

  isConnected() {
    return this.connected && this.client;
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.disconnect();
        this.connected = false;
        logger.info('Twitch bot disconnected');
      } catch (error) {
        logger.error('Error disconnecting Twitch bot:', error);
      }
    }
  }

  // Get bot statistics
  getStats() {
    const channels = this.channelManager.getActiveChannels();
    const channelStats = {};
    
    for (const channelId of channels) {
      const moderators = this.channelModerators.get(channelId) || new Set();
      const bannedUsers = this.channelBannedUsers.get(channelId) || new Set();
      
      channelStats[channelId] = {
        moderators: Array.from(moderators),
        bannedUsers: Array.from(bannedUsers)
      };
    }

    return {
      connected: this.connected,
      channels: channels,
      channelStats: channelStats,
      rateLimitedUsers: this.rateLimiter.size
    };
  }

  // Add method to join a new channel dynamically
  async joinChannel(channelId) {
    if (this.client && this.connected) {
      try {
        await this.client.join(`#${channelId}`);
        
        // Initialize channel-specific state
        this.channelModerators.set(channelId, new Set());
        this.channelBannedUsers.set(channelId, new Set());
        
        logger.info(`Bot joined channel: ${channelId}`);
        return true;
      } catch (error) {
        logger.error(`Failed to join channel ${channelId}:`, error);
        return false;
      }
    }
    return false;
  }

  // Add method to leave a channel dynamically
  async leaveChannel(channelId) {
    if (this.client && this.connected) {
      try {
        await this.client.part(`#${channelId}`);
        
        // Clean up channel-specific state
        this.channelModerators.delete(channelId);
        this.channelBannedUsers.delete(channelId);
        
        // Clean up rate limits for this channel
        for (const [key] of this.rateLimiter) {
          if (key.startsWith(`${channelId}:`)) {
            this.rateLimiter.delete(key);
          }
        }
        
        logger.info(`Bot left channel: ${channelId}`);
        return true;
      } catch (error) {
        logger.error(`Failed to leave channel ${channelId}:`, error);
        return false;
      }
    }
    return false;
  }
}

module.exports = TwitchBot;
