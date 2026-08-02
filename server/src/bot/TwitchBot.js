const tmi = require('tmi.js');
const logger = require('../utils/logger');
const VideoService = require('../services/VideoService');
const LLMService = require('../services/LLMService');

// Base URL for public web app links (strip trailing slashes)
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

class TwitchBot {
  constructor(channelManager, io) {
    this.channelManager = channelManager;
    this.io = io;
    this.client = null;
    this.videoService = new VideoService();
    this.llmService = new LLMService();
    this.connected = false;
    this.rateLimiter = new Map(); // Track user rate limits per channel
    this.channelModerators = new Map(); // channelId -> Set of moderators
    this.channelBannedUsers = new Map(); // channelId -> Set of banned users
    this.pendingDuplicateConfirms = new Map(); // key: `${channelId}:${username}` -> { videoId, expiresAt }
    this._historicalIds = null; // lazy-loaded Set of historical YouTube IDs
    this.cleanupInterval = null;
    this.cleanupIntervalMs = 5 * 60 * 1000; // sweep stale maps every 5 minutes
    this.rateLimitTtlMs = 15 * 60 * 1000; // keep rate-limit history for 15 minutes max
    this.duplicateConfirmTtlMs = 2 * 60 * 1000; // matches the 2 minute confirmation window
    
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

      this._startCleanupTask();
      logger.info(`Twitch bot connected to ${activeChannels.length} channels: ${activeChannels.join(', ')}`);
    } catch (error) {
      logger.error('Failed to initialize Twitch bot:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Connection events
    this.client.on('connected', (address, port) => {
      this.connected = true;
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
      await this.sendPersonalityMessage(channel, `@${displayName} Sorry, there was an error processing your request.`, {
        intent: "Something broke internally while handling this viewer's request. Apologize briefly without technical detail.",
        mustInclude: [`@${displayName}`]
      });
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

          const result = await queueService.addToQueue(metadata, username, { isVip: true });
          const added = result?.queueItem || null;

          if (added) {
            // Mark as VIP so it is played next (FIFO among VIPs) and excluded from shuffles
            await queueService.addVipForItem(added.id);

            await this.sendPersonalityMessage(channel, `@${username} Thank you for the ${bits} bits! Your video has been added as a VIP and will play next: ${metadata.title}`, {
              intent: 'A viewer cheered bits, which bought their video a VIP slot — it jumps the queue and plays next. Thank them with flair.',
              facts: { bits, videoTitle: metadata.title },
              mustInclude: [`@${username}`, metadata.title]
            });
            this.applyRateLimit(`${channelId}:${username}`);
            break; // only process first valid URL
          }
        } catch (err) {
          logger.warn('Failed to process VIP cheer URL', { channelId, username, error: err });
          // notify user of failure
          await this.sendPersonalityMessage(channel, `@${username} Failed to add VIP video: ${err.message}`, {
            intent: 'A viewer cheered bits for a VIP video but adding it failed. Break the bad news and relay the reason.',
            facts: { reason: err.message },
            mustInclude: [`@${username}`]
          });
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
        await this.sendPersonalityMessage(channel, `@${displayName} Profile link for ${cleanTarget}: ${url}`, {
          intent: 'A viewer asked for a profile/score page link. Hand it over.',
          facts: { profileUser: cleanTarget },
          mustInclude: [`@${displayName}`, url]
        });
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
          await this.sendPersonalityMessage(channel, `@${displayName} Only moderators can skip videos.`, {
            intent: 'A non-moderator tried to skip the current video. Shut it down — mods only.',
            mustInclude: [`@${displayName}`]
          });
        }
        break;

      case 'clear':
        if (isModerator) {
          await this.handleClearCommand(channel, channelId, username);
        } else {
          await this.sendPersonalityMessage(channel, `@${displayName} Only moderators can clear the queue.`, {
            intent: 'A non-moderator tried to clear the entire queue. Shut it down — mods only.',
            mustInclude: [`@${displayName}`]
          });
        }
        break;

      case 'volume':
        if (isModerator && args[1]) {
          await this.handleVolumeCommand(channel, channelId, args[1]);
        } else if (!isModerator) {
          await this.sendPersonalityMessage(channel, `@${displayName} Only moderators can change volume.`, {
            intent: 'A non-moderator tried to change the playback volume. Shut it down — mods only.',
            mustInclude: [`@${displayName}`]
          });
        } else {
          await this.sendPersonalityMessage(channel, `@${displayName} Usage: !volume <0-100>`, {
            intent: 'A moderator used !volume without a value. Tell them the correct usage.',
            mustInclude: [`@${displayName}`, '!volume <0-100>']
          });
        }
        break;

      // ads command removed; announcements handled via Twitch API

      case 'ban':
        if (isModerator && args[1]) {
          await this.handleBanCommand(channel, channelId, args[1]);
        } else if (!isModerator) {
          await this.sendPersonalityMessage(channel, `@${displayName} Only moderators can ban users.`, {
            intent: 'A non-moderator tried to ban someone from submissions. Shut it down — mods only.',
            mustInclude: [`@${displayName}`]
          });
        } else {
          await this.sendPersonalityMessage(channel, `@${displayName} Usage: !ban @username`, {
            intent: 'A moderator used !ban without naming a user. Tell them the correct usage.',
            mustInclude: [`@${displayName}`, '!ban @username']
          });
        }
        break;

      case 'unban':
        if (isModerator && args[1]) {
          await this.handleUnbanCommand(channel, channelId, args[1]);
        } else if (!isModerator) {
          await this.sendPersonalityMessage(channel, `@${displayName} Only moderators can unban users.`, {
            intent: 'A non-moderator tried to unban someone. Shut it down — mods only.',
            mustInclude: [`@${displayName}`]
          });
        } else {
          await this.sendPersonalityMessage(channel, `@${displayName} Usage: !unban @username`, {
            intent: 'A moderator used !unban without naming a user. Tell them the correct usage.',
            mustInclude: [`@${displayName}`, '!unban @username']
          });
        }
        break;

      case 'vote':
        // Chat voting: always silent (success or failure) to avoid chat spam
        await this.handleVoteCommand(channelId, username, args[1]);
        break;

      case 'abort':
        await this.handleAbortCommand(channel, channelId, username, displayName);
        break;

      case 'help':
        await this.showHelp(channel, displayName);
        break;

      default:
        // Unknown command - ignore silently
        break;
    }
  }

  async handleQueueCommand(channel, channelId, userstate, action, isModerator) {
    const displayName = userstate['display-name'] || userstate.username;

    if (!isModerator) {
      await this.sendPersonalityMessage(channel, `@${displayName} Only moderators can control the queue.`, {
        intent: 'A non-moderator tried to turn the queue on or off. Shut it down — mods only.',
        mustInclude: [`@${displayName}`]
      });
      return;
    }

    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      await this.sendServiceUnavailable(channel);
      return;
    }

    switch (action.toLowerCase()) {
      case 'on':
      case 'enable':
        await queueService.enableQueue(true);
        await this.sendPersonalityMessage(channel, 'Queue is now enabled! Drop your video links in chat!', {
          intent: 'The queue just opened. Hype chat up to submit their YouTube links.'
        });
        break;

      case 'off':
      case 'disable':
        await queueService.enableQueue(false);
        await this.sendPersonalityMessage(channel, 'Queue is now disabled.', {
          intent: 'The queue just closed. Announce that submissions are shut for now.'
        });
        break;

      default:
        await this.sendPersonalityMessage(channel, `@${displayName} Usage: !queue on/off`, {
          intent: 'A moderator used !queue with an unknown option. Tell them the correct usage.',
          mustInclude: [`@${displayName}`, '!queue on/off']
        });
        break;
    }
  }

  async handleVoteCommand(channelId, username, rawScore) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService || typeof queueService.isChatVotingOpen !== 'function' || !queueService.isChatVotingOpen()) {
      return;
    }

    // Accept decimals with either separator (e.g. 3.5 or 3,5)
    const normalized = (rawScore || '').toString().trim().replace(',', '.');
    if (!normalized) {
      return;
    }

    const score = Number(normalized);
    if (!Number.isFinite(score)) {
      return;
    }

    queueService.registerChatVote(username, score);
  }

  async showQueueStatus(channel, channelId) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      await this.sendServiceUnavailable(channel);
      return;
    }

    const isEnabled = await queueService.isQueueEnabled();
    const queueSize = await queueService.getQueueSize();
    const maxSize = await queueService.getSetting('max_queue_size', '50');
    
    const status = isEnabled ? 'enabled' : 'disabled';
    await this.sendPersonalityMessage(channel, `Queue is ${status} (${queueSize}/${maxSize} videos)`, {
      intent: `A viewer asked for the queue status. The queue is currently ${status} with ${queueSize} of ${maxSize} slots filled.`,
      mustInclude: [`${queueSize}/${maxSize}`]
    });
  }

  async handleSkipCommand(channel, channelId, username) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      await this.sendServiceUnavailable(channel);
      return;
    }

    try {
      const nextVideo = await queueService.skipCurrent(username);
      if (nextVideo) {
        await this.sendPersonalityMessage(channel, `Skipped! Now playing: ${nextVideo.title}`, {
          intent: 'A moderator skipped the current video and a new one is starting. Announce what is playing now.',
          facts: { nowPlaying: nextVideo.title },
          mustInclude: [nextVideo.title]
        });
      } else {
        await this.sendPersonalityMessage(channel, 'Skipped! Queue is empty.', {
          intent: 'A moderator skipped the current video and nothing is left in the queue.'
        });
      }
    } catch (error) {
      await this.sendPersonalityMessage(channel, `Error: ${error.message}`, {
        intent: 'Skipping the current video failed. Relay the reason honestly.',
        facts: { reason: error.message }
      });
    }
  }

  async handleClearCommand(channel, channelId, username) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      await this.sendServiceUnavailable(channel);
      return;
    }

    try {
      await queueService.clearQueue(username);
      await this.sendPersonalityMessage(channel, 'Queue cleared!', {
        intent: 'A moderator wiped the entire queue. Announce the purge.'
      });
    } catch (error) {
      await this.sendPersonalityMessage(channel, `Error: ${error.message}`, {
        intent: 'Clearing the queue failed. Relay the reason honestly.',
        facts: { reason: error.message }
      });
    }
  }

  async handleAbortCommand(channel, channelId, username, displayName) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      await this.sendServiceUnavailable(channel);
      return;
    }

    try {
      const { removed } = await queueService.abortUserSubmissions(username);

      if (!removed) {
        await this.sendPersonalityMessage(channel, `@${displayName} Abort what, exactly? You have nothing in the queue. Bold move pulling videos you never submitted.`, {
          intent: 'A viewer used !abort to pull all their submissions, but they have nothing in the queue. Roast them for aborting nothing.',
          mustInclude: [`@${displayName}`]
        });
        return;
      }

      const videoCount = `${removed} video${removed === 1 ? '' : 's'}`;
      const snarkyFallbacks = [
        `@${displayName} yanked ${videoCount} out of the queue. The meta shifted and they folded like a lawn chair.`,
        `@${displayName} just rage-quit the queue and took ${videoCount} with them. Vibes: officially rattled.`,
        `@${displayName} aborted ${videoCount}. Nothing says confidence like pulling your own submissions.`,
        `@${displayName} withdrew ${videoCount}. Reading the room and bailing — self-awareness we love to see.`
      ];
      await this.sendPersonalityMessage(channel, snarkyFallbacks[Math.floor(Math.random() * snarkyFallbacks.length)], {
        intent: `A viewer used !abort and pulled all ${videoCount} of theirs out of the queue because the stream's vibe or meta changed. Send them off with fresh snark.`,
        facts: { videosRemoved: removed },
        mustInclude: [`@${displayName}`]
      });
    } catch (error) {
      await this.sendPersonalityMessage(channel, `@${displayName} Error aborting your submissions: ${error.message}`, {
        intent: "Removing the viewer's submissions failed. Relay the reason honestly.",
        facts: { reason: error.message },
        mustInclude: [`@${displayName}`]
      });
    }
  }

  async handleVolumeCommand(channel, channelId, volumeStr) {
    const queueService = this.channelManager.getQueueService(channelId);
    if (!queueService) {
      await this.sendServiceUnavailable(channel);
      return;
    }

    const volume = parseInt(volumeStr);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      await this.sendPersonalityMessage(channel, 'Volume must be a number between 0 and 100.', {
        intent: 'A moderator gave an invalid volume value. Volume must be a number between 0 and 100 — say so clearly.',
        mustInclude: ['100']
      });
      return;
    }

    try {
      await queueService.updateSetting('current_volume', volume);
      await this.sendPersonalityMessage(channel, `Volume set to ${volume}%`, {
        intent: 'A moderator changed the playback volume. Confirm the new level.',
        mustInclude: [`${volume}%`]
      });
    } catch (error) {
      await this.sendPersonalityMessage(channel, `Error setting volume: ${error.message}`, {
        intent: 'Changing the volume failed. Relay the reason honestly.',
        facts: { reason: error.message }
      });
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
    await this.sendPersonalityMessage(channel, `${username} has been banned from submitting videos.`, {
      intent: 'A moderator banned this user from submitting videos. Announce the ban.',
      facts: { bannedUser: username },
      mustInclude: [username]
    });
    
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
    
    await this.sendPersonalityMessage(channel, `${username} has been unbanned and can now submit videos.`, {
      intent: 'A moderator unbanned this user; they can submit videos again. Announce their return.',
      facts: { unbannedUser: username },
      mustInclude: [username]
    });
    
    // Log the unban
    const queueService = this.channelManager.getQueueService(channelId);
    if (queueService) {
      await queueService.logSubmission('system', 'UNBAN_USER', { username });
    }
  }

  // ads command removed; announcements handled via Twitch API

  async showHelp(channel, displayName) {
    const channelId = channel.substring(1).toLowerCase();
    const viewerHubUrl = `${CLIENT_URL}/viewer/${channelId}`;
    const queuePageUrl = `${CLIENT_URL}/channel/${channelId}`;

    // Intro line gets personality; the command/link lines stay verbatim so
    // syntax and URLs can't get mangled by the LLM.
    await this.sendPersonalityMessage(channel, `@${displayName} Here's how to get in on the show:`, {
      intent: 'A viewer asked for help. Introduce the how-to-play rundown that follows in the next messages.',
      mustInclude: [`@${displayName}`]
    });

    const helpMessages = [
      'Submit: drop a YouTube link in chat while the queue is open',
      '!queue - check queue status • !vote <0-5> - score the current video when voting is open',
      '!abort - pull all your unplayed videos • !profile - your score history',
      `Viewer Hub: ${viewerHubUrl} • Live queue: ${queuePageUrl}`
    ];
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
              expiresAt: now + this.duplicateConfirmTtlMs
            });
            await this.sendPersonalityMessage(channel, `@${username} This video has already been rated before. To confirm, submit the same link again within 2 minutes. You must beat your previous run to keep your score.`, {
              intent: 'A viewer submitted a video that has been rated before. To confirm they really want this, they must submit the same link again within 2 minutes, and they must beat the previous score to keep it. State both rules clearly.',
              mustInclude: [`@${username}`, '2 minutes']
            });
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
        await this.sendPersonalityMessage(channel, `@${username} Added to queue: ${metadata.title}`, {
          intent: "A viewer's video was accepted into the queue. Confirm it landed.",
          facts: { videoTitle: metadata.title },
          mustInclude: [`@${username}`, metadata.title]
        });

        if (Array.isArray(result?.warnings)) {
          for (const warning of result.warnings) {
            if (warning?.message) {
              await this.sendPersonalityMessage(channel, `⚠️ ${warning.message}`, {
                intent: 'Relay this warning about the submission to chat without losing its meaning.',
                mustInclude: [warning.message]
              });
            }
          }
        }
        
        // Apply rate limiting
        this.applyRateLimit(rateLimitKey);
        
        // Only process first valid URL per message
        break;
      } catch (error) {
        logger.warn(`Failed to process video URL ${url} from ${username}:`, error);
        await this.sendPersonalityMessage(channel, `@${username} ${error.message}`, {
          intent: "A viewer's video submission was rejected. Explain why using the reason given.",
          facts: { reason: error.message },
          mustInclude: [`@${username}`]
        });
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

  _startCleanupTask() {
    this._stopCleanupTask();
    const sweep = () => {
      const now = Date.now();
      let removed = 0;

      for (const [key, meta] of this.rateLimiter.entries()) {
        if (!meta?.lastSubmission || now - meta.lastSubmission > this.rateLimitTtlMs) {
          this.rateLimiter.delete(key);
          removed++;
        }
      }

      for (const [key, meta] of this.pendingDuplicateConfirms.entries()) {
        if (!meta?.expiresAt || meta.expiresAt <= now) {
          this.pendingDuplicateConfirms.delete(key);
          removed++;
        }
      }

      if (typeof this.videoService?.pruneExpiredCache === 'function') {
        removed += this.videoService.pruneExpiredCache(now);
      }

      if (removed > 0 && logger.debug) {
        logger.debug('TwitchBot: cleaned stale state', { removed });
      }
    };

    sweep();
    this.cleanupInterval = setInterval(sweep, this.cleanupIntervalMs);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  _stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Route a chat response through the LLM for personality. The static
  // fallback is always sent verbatim when the LLM is disabled or fails.
  async sendPersonalityMessage(channel, fallback, prompt = {}) {
    const message = await this.llmService.rewrite({ ...prompt, fallback });
    this.sendMessage(channel, message);
  }

  async sendServiceUnavailable(channel) {
    await this.sendPersonalityMessage(channel, 'Queue service not available for this channel.', {
      intent: 'The queue backend for this channel is not running, so the request cannot be handled right now.'
    });
  }

  sendMessage(channel, message) {
    if (this.client && this.connected) {
      // say() rejects on timeout/rate-limit; unhandled rejections kill the process
      this.client.say(channel, message).catch((err) => {
        logger.warn('Failed to send chat message', { channel, error: err?.message || err });
      });
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
    return Boolean(this.connected && this.client);
  }

  async disconnect() {
    this._stopCleanupTask();
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
