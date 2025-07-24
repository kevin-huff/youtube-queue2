const tmi = require('tmi.js');
const logger = require('../utils/logger');
const VideoService = require('../services/VideoService');

class TwitchBot {
  constructor(queueService, io) {
    this.queueService = queueService;
    this.io = io;
    this.client = null;
    this.videoService = new VideoService();
    this.connected = false;
    this.rateLimiter = new Map(); // Track user rate limits
    this.moderators = new Set();
    this.bannedUsers = new Set();
    
    this.config = {
      options: {
        debug: process.env.NODE_ENV === 'development'
      },
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_OAUTH_TOKEN
      },
      channels: [process.env.TWITCH_CHANNEL]
    };
  }

  async initialize() {
    try {
      this.client = new tmi.Client(this.config);

      // Set up event listeners
      this.setupEventListeners();

      // Connect to Twitch
      await this.client.connect();
      this.connected = true;

      logger.info(`Twitch bot connected to channel: ${process.env.TWITCH_CHANNEL}`);
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
    this.client.on('join', this.handleJoin.bind(this));
    this.client.on('part', this.handlePart.bind(this));

    // Moderation events
    this.client.on('mod', (channel, username) => {
      this.moderators.add(username.toLowerCase());
      logger.info(`${username} is now a moderator`);
    });

    this.client.on('unmod', (channel, username) => {
      this.moderators.delete(username.toLowerCase());
      logger.info(`${username} is no longer a moderator`);
    });
  }

  async handleMessage(channel, userstate, message, self) {
    // Ignore messages from the bot itself
    if (self) return;

    const username = userstate.username.toLowerCase();
    const displayName = userstate['display-name'] || username;
    const isModerator = userstate.mod || userstate.badges?.broadcaster;
    const isSubscriber = userstate.subscriber;

    try {
      // Check if user is banned
      if (this.bannedUsers.has(username)) {
        return;
      }

      // Handle commands
      if (message.startsWith('!')) {
        await this.handleCommand(channel, userstate, message, isModerator);
        return;
      }

      // Check for video URLs in message
      await this.checkForVideoUrls(channel, username, message);
    } catch (error) {
      logger.error('Error handling message:', error);
      this.sendMessage(channel, `@${displayName} Sorry, there was an error processing your request.`);
    }
  }

  async handleCommand(channel, userstate, message, isModerator) {
    const args = message.slice(1).split(' ');
    const command = args[0].toLowerCase();
    const username = userstate.username.toLowerCase();
    const displayName = userstate['display-name'] || username;

    switch (command) {
      case 'queue':
        if (args[1]) {
          await this.handleQueueCommand(channel, userstate, args[1], isModerator);
        } else {
          await this.showQueueStatus(channel);
        }
        break;

      case 'skip':
        if (isModerator) {
          await this.handleSkipCommand(channel, username);
        } else {
          this.sendMessage(channel, `@${displayName} Only moderators can skip videos.`);
        }
        break;

      case 'clear':
        if (isModerator) {
          await this.handleClearCommand(channel, username);
        } else {
          this.sendMessage(channel, `@${displayName} Only moderators can clear the queue.`);
        }
        break;

      case 'volume':
        if (isModerator && args[1]) {
          await this.handleVolumeCommand(channel, args[1]);
        } else if (!isModerator) {
          this.sendMessage(channel, `@${displayName} Only moderators can change volume.`);
        } else {
          this.sendMessage(channel, `@${displayName} Usage: !volume <0-100>`);
        }
        break;

      case 'ban':
        if (isModerator && args[1]) {
          await this.handleBanCommand(channel, args[1]);
        } else if (!isModerator) {
          this.sendMessage(channel, `@${displayName} Only moderators can ban users.`);
        } else {
          this.sendMessage(channel, `@${displayName} Usage: !ban @username`);
        }
        break;

      case 'unban':
        if (isModerator && args[1]) {
          await this.handleUnbanCommand(channel, args[1]);
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

  async handleQueueCommand(channel, userstate, action, isModerator) {
    const displayName = userstate['display-name'] || userstate.username;

    if (!isModerator) {
      this.sendMessage(channel, `@${displayName} Only moderators can control the queue.`);
      return;
    }

    switch (action.toLowerCase()) {
      case 'on':
      case 'enable':
        await this.queueService.enableQueue(true);
        this.sendMessage(channel, 'Queue is now enabled! Drop your video links in chat!');
        break;

      case 'off':
      case 'disable':
        await this.queueService.enableQueue(false);
        this.sendMessage(channel, 'Queue is now disabled.');
        break;

      default:
        this.sendMessage(channel, `@${displayName} Usage: !queue on/off`);
        break;
    }
  }

  async showQueueStatus(channel) {
    const isEnabled = await this.queueService.isQueueEnabled();
    const queueSize = await this.queueService.getQueueSize();
    const maxSize = await this.queueService.getSetting('max_queue_size', '50');
    
    const status = isEnabled ? 'enabled' : 'disabled';
    this.sendMessage(channel, `Queue is ${status} (${queueSize}/${maxSize} videos)`);
  }

  async handleSkipCommand(channel, username) {
    try {
      const nextVideo = await this.queueService.skipCurrent(username);
      if (nextVideo) {
        this.sendMessage(channel, `Skipped! Now playing: ${nextVideo.title}`);
      } else {
        this.sendMessage(channel, 'Skipped! Queue is empty.');
      }
    } catch (error) {
      this.sendMessage(channel, `Error: ${error.message}`);
    }
  }

  async handleClearCommand(channel, username) {
    try {
      await this.queueService.clearQueue(username);
      this.sendMessage(channel, 'Queue cleared!');
    } catch (error) {
      this.sendMessage(channel, `Error: ${error.message}`);
    }
  }

  async handleVolumeCommand(channel, volumeStr) {
    const volume = parseInt(volumeStr);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      this.sendMessage(channel, 'Volume must be a number between 0 and 100.');
      return;
    }

    try {
      await this.queueService.updateSetting('current_volume', volume);
      this.sendMessage(channel, `Volume set to ${volume}%`);
    } catch (error) {
      this.sendMessage(channel, `Error setting volume: ${error.message}`);
    }
  }

  async handleBanCommand(channel, target) {
    const username = target.replace('@', '').toLowerCase();
    this.bannedUsers.add(username);
    this.sendMessage(channel, `${username} has been banned from submitting videos.`);
    
    // Log the ban
    await this.queueService.logSubmission('system', 'BAN_USER', { username });
  }

  async handleUnbanCommand(channel, target) {
    const username = target.replace('@', '').toLowerCase();
    this.bannedUsers.delete(username);
    this.sendMessage(channel, `${username} has been unbanned and can now submit videos.`);
    
    // Log the unban
    await this.queueService.logSubmission('system', 'UNBAN_USER', { username });
  }

  showHelp(channel, displayName, isModerator) {
    const helpMessages = [
      `@${displayName} Available commands:`
    ];

    if (isModerator) {
      helpMessages.push(
        '!queue on/off - Enable/disable queue',
        '!skip - Skip current video',
        '!clear - Clear entire queue',
        '!volume <0-100> - Set volume',
        '!ban @user - Ban user from submissions',
        '!unban @user - Unban user'
      );
    } else {
      helpMessages.push('Just drop YouTube/TikTok/Instagram links in chat when the queue is open!');
    }

    helpMessages.forEach(msg => this.sendMessage(channel, msg));
  }

  async checkForVideoUrls(channel, username, message) {
    // Check if queue is enabled
    if (!(await this.queueService.isQueueEnabled())) {
      return;
    }

    // Check rate limiting
    if (this.isRateLimited(username)) {
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

        // Get video metadata
        const metadata = await this.videoService.getVideoMetadata(url);
        
        // Add to queue
        await this.queueService.addToQueue(metadata, username);
        
        this.sendMessage(channel, `@${username} Added to queue: ${metadata.title}`);
        
        // Apply rate limiting
        this.applyRateLimit(username);
        
        // Only process first valid URL per message
        break;
      } catch (error) {
        logger.warn(`Failed to process video URL ${url} from ${username}:`, error);
        this.sendMessage(channel, `@${username} ${error.message}`);
        break;
      }
    }
  }

  isRateLimited(username) {
    const now = Date.now();
    const userLimit = this.rateLimiter.get(username);
    
    if (!userLimit) return false;
    
    // Check if cooldown has passed
    const cooldown = 5000; // 5 seconds between submissions
    return (now - userLimit.lastSubmission) < cooldown;
  }

  applyRateLimit(username) {
    this.rateLimiter.set(username, {
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
    return {
      connected: this.connected,
      channel: process.env.TWITCH_CHANNEL,
      moderators: Array.from(this.moderators),
      bannedUsers: Array.from(this.bannedUsers),
      rateLimitedUsers: this.rateLimiter.size
    };
  }
}

module.exports = TwitchBot;
