const logger = require('../utils/logger');
const { verifyJudgeToken } = require('../auth/judgeToken');
const {
  ADMIN_ROLES,
  MODERATION_ROLES,
  PLAYBACK_ROLES,
  resolveChannelRoles,
  hasAnyRole
} = require('./channelAuth');

// Mutating socket events are gated per category, mirroring the roles the
// REST layer grants in api/queue.routes.js (role lists live in
// ./channelAuth.js).
//
// SECURITY: the event gate below is default-deny. Any handler registered for
// an event that is not in PUBLIC_EVENTS or one of the category sets below is
// gated as ADMIN — so newly added mutating events fail closed. When adding a
// new event, put it in the correct category set.

// ADMIN (OWNER/MANAGER/PRODUCER): destructive/config actions
const ADMIN_EVENTS = new Set([
  'queue:reorder', 'queue:clear', 'settings:update',
  'admin:enable_queue', 'admin:disable_queue',
  'overlay:show_player', 'overlay:hide_player'
]);

// MODERATION (OWNER/MANAGER/PRODUCER/MODERATOR): queue moderation
const MODERATION_EVENTS = new Set([
  'queue:remove'
]);

// PLAYBACK (OWNER/MANAGER/PRODUCER/HOST): show-flow/playback control
const PLAYBACK_EVENTS = new Set([
  'queue:skip', 'queue:play_next', 'queue:replay_previous',
  'queue:mark_played', 'volume:change'
]);

// Player transport events — PLAYBACK roles AND verified judge-token sockets
// (judges controlling playback via token auth is a deliberate feature).
// Judge tokens grant ONLY these events, nothing else.
const PLAYER_EVENTS = new Set([
  'player:play', 'player:pause', 'player:seek'
]);

// Read-only events that anonymous clients (OBS overlays, viewer pages) rely
// on. New public events MUST be added here explicitly, otherwise they are
// gated as admin events.
const PUBLIC_EVENTS = new Set([
  'queue:join', 'status:request', 'player:state_request', 'overlay:state_request'
]);

// socket.io reserved/internal events that must never be gated
const RESERVED_EVENTS = new Set([
  'disconnect', 'disconnecting', 'error', 'newListener', 'removeListener'
]);

function getSocketUser(socket) {
  // Passport attaches user to request via session
  return socket.request?.user || null;
}

function socketHandler(io, channelManager) {
  const setupChannelNamespace = (channelId, providedNamespace) => {
    const namespacePath = `/channel/${channelId}`;
    const namespace = providedNamespace || io.of(namespacePath);

    if (namespace._queueListenersAttached) {
      return namespace;
    }

    namespace._queueListenersAttached = true;

    // Ensure overlay state exists per namespace
    if (!namespace._overlayState) {
      namespace._overlayState = { showPlayer: null, lastUpdate: Date.now() };
    }

    // Resolve identity and the user's expanded channel role set once per
    // connection. NOTE: the result is cached on socket.data for the lifetime
    // of the connection — role grants/revocations take effect on reconnect.
    namespace.use(async (socket, next) => {
      socket.data.user = getSocketUser(socket);
      socket.data.channelRoles = new Set();

      // A judge token in the handshake grants channel-scoped player control
      const judgeToken = socket.handshake?.auth?.judgeToken;
      if (judgeToken) {
        const decoded = verifyJudgeToken(judgeToken);
        if (decoded && decoded.channelId === channelId) {
          socket.data.judgeAuth = decoded;
        }
      }

      if (socket.data.user) {
        try {
          socket.data.channelRoles = await resolveChannelRoles({
            user: socket.data.user,
            channelId,
            channelManager
          });
        } catch (error) {
          logger.error(`Error resolving channel authorization for ${socket.id} on channel ${channelId}:`, error);
          socket.data.channelRoles = new Set();
        }
      }

      return next();
    });

    namespace.on('connection', (socket) => {
      logger.info(`Client connected to channel ${channelId}: ${socket.id}`);

      // Gate events: default-deny. PUBLIC_EVENTS are open; each mutating
      // event category requires the matching channel roles (see role lists
      // in ./channelAuth.js); judge-token sockets get PLAYER_EVENTS only;
      // anything uncategorized is gated as ADMIN (fail closed).
      const originalOn = socket.on.bind(socket);
      const denyEvent = (event) => {
        const identity = socket.data.user?.username
          || socket.data.judgeAuth?.judgeId
          || 'anonymous';
        logger.warn(`Denied socket event ${event} on channel ${channelId} for ${identity} (${socket.id})`);
        socket.emit('error', {
          message: socket.data.user || socket.data.judgeAuth
            ? 'You are not authorized to perform this action on this channel'
            : 'Authentication required for this action'
        });
      };
      const requirementFor = (event) => {
        if (PLAYER_EVENTS.has(event)) {
          return { allowedRoles: PLAYBACK_ROLES, allowJudge: true };
        }
        if (PLAYBACK_EVENTS.has(event)) {
          return { allowedRoles: PLAYBACK_ROLES, allowJudge: false };
        }
        if (MODERATION_EVENTS.has(event)) {
          return { allowedRoles: MODERATION_ROLES, allowJudge: false };
        }
        // ADMIN_EVENTS and any event not explicitly categorized fail closed
        if (!ADMIN_EVENTS.has(event)) {
          logger.warn(`Socket event "${event}" is not categorized; gating as ADMIN (fail closed). Add it to the correct event category set in socket/index.js.`);
        }
        return { allowedRoles: ADMIN_ROLES, allowJudge: false };
      };
      socket.on = function(event, handler) {
        if (RESERVED_EVENTS.has(event) || PUBLIC_EVENTS.has(event)) {
          return originalOn(event, handler);
        }
        const { allowedRoles, allowJudge } = requirementFor(event);
        return originalOn(event, async (...args) => {
          const authorized = hasAnyRole(socket.data.channelRoles, allowedRoles)
            || (allowJudge && Boolean(socket.data.judgeAuth));
          if (!authorized) {
            denyEvent(event);
            return;
          }
          return handler(...args);
        });
      };

      const queueService = channelManager.getQueueService(channelId);
      if (!queueService) {
        socket.emit('error', { message: 'Queue service not available' });
        socket.disconnect(true);
        return;
      }

      // Allow clients to request the current queue state
      socket.on('queue:join', async () => {
        try {
          const [queue, enabled, vipQueue, shuffleAudioUrl, activeCup] = await Promise.all([
            queueService.getCurrentQueue(),
            queueService.isQueueEnabled(),
            // Provide initial VIP list to clients
            queueService._getVipList(),
            // Provide initial shuffle audio so overlays can play without auth
            queueService.getSetting('shuffle_audio_url', ''),
            // Surface the currently active cup so producer UI can reflect it even with an empty queue
            queueService.db?.cup.findFirst({
              where: {
                channelId,
                isActive: true
              },
              select: {
                id: true,
                title: true,
                theme: true,
                status: true,
                isActive: true,
                startsAt: true,
                endsAt: true
              }
            })
          ]);

          socket.emit('queue:initial_state', {
            queue,
            enabled,
            currentlyPlaying: queueService.currentlyPlaying,
            votingState: queueService.getVotingState(),
            overlayState: namespace._overlayState || { showPlayer: null },
            vipQueue,
            gongState: queueService.getGongState(),
            activeCup: activeCup || null,
            settings: {
              shuffle_audio_url: shuffleAudioUrl || '',
              activeCupId: activeCup?.id || null
            }
          });

          logger.debug(`Sent initial queue state for channel ${channelId} to ${socket.id}`);
        } catch (error) {
          logger.error(`Error sending initial queue state for channel ${channelId}:`, error);
          socket.emit('error', { message: 'Failed to load queue state' });
        }
      });

      socket.on('queue:remove', async (data) => {
        try {
          data = data || {};
          const { itemId, removedBy = 'admin' } = data;
          if (!itemId) {
            socket.emit('error', { message: 'Item ID is required' });
            return;
          }
          await queueService.removeFromQueue(itemId, removedBy);
        } catch (error) {
          logger.error('Error removing queue item via socket:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('queue:reorder', async (data) => {
        try {
          data = data || {};
          const { newOrder } = data;
          if (!Array.isArray(newOrder)) {
            socket.emit('error', { message: 'New order must be an array' });
            return;
          }
          await queueService.reorderQueue(newOrder);
        } catch (error) {
          logger.error('Error reordering queue:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('queue:play_next', async (data) => {
        try {
          data = data || {};
          const advancedBy = typeof data.advancedBy === 'string' && data.advancedBy.trim().length
            ? data.advancedBy.trim()
            : (socket.request?.user?.username || 'producer');

          const requestedStatus = typeof data.finalizeStatus === 'string' && data.finalizeStatus.trim().length
            ? data.finalizeStatus.trim().toUpperCase()
            : 'PLAYED';
          const finalizeStatus = ['PLAYED', 'SKIPPED'].includes(requestedStatus) ? requestedStatus : 'PLAYED';

          await queueService.playNext({
            finalizeCurrent: true,
            finalizeStatus,
            initiatedBy: advancedBy
          });
        } catch (error) {
          logger.error('Error playing next video:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('queue:skip', async (data) => {
        try {
          data = data || {};
          const { skippedBy = 'admin' } = data;
          await queueService.skipCurrent(skippedBy);
        } catch (error) {
          logger.error('Error skipping video:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('queue:replay_previous', async (data) => {
        try {
          data = data || {};
          const { initiatedBy = 'admin' } = data;
          await queueService.replayPrevious(initiatedBy);
        } catch (error) {
          logger.error('Error replaying previous video:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('queue:mark_played', async (data) => {
        try {
          data = data || {};
          const { itemId } = data;
          if (!itemId) {
            socket.emit('error', { message: 'Item ID is required' });
            return;
          }
          await queueService.markAsPlayed(itemId);
        } catch (error) {
          logger.error('Error marking video as played:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('queue:clear', async (data) => {
        try {
          data = data || {};
          const { clearedBy = 'admin' } = data;
          await queueService.clearQueue(clearedBy);
        } catch (error) {
          logger.error('Error clearing queue:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('settings:update', async (data) => {
        try {
          data = data || {};
          const { key, value } = data;
          if (!key || value === undefined) {
            socket.emit('error', { message: 'Key and value are required' });
            return;
          }
          await queueService.updateSetting(key, value);
        } catch (error) {
          logger.error('Error updating setting via socket:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('volume:change', async (data) => {
        try {
          data = data || {};
          const { volume } = data;
          if (typeof volume !== 'number' || volume < 0 || volume > 100) {
            socket.emit('error', { message: 'Volume must be between 0 and 100' });
            return;
          }
          await queueService.updateSetting('current_volume', volume);
        } catch (error) {
          logger.error('Error updating volume:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('admin:enable_queue', async () => {
        try {
          await queueService.enableQueue(true);
        } catch (error) {
          logger.error('Error enabling queue:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('admin:disable_queue', async () => {
        try {
          await queueService.enableQueue(false);
        } catch (error) {
          logger.error('Error disabling queue:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('player:play', (data) => {
        data = data || {};
        logger.info(`player:play via socket ${socket.id} for channel ${channelId} (time=${data.time ?? 'n/a'})`);
        // Update player state
        if (!namespace._playerState) {
          namespace._playerState = {};
        }
        namespace._playerState.playing = true;
        if (typeof data.time === 'number') {
          namespace._playerState.time = data.time;
        }
        namespace._playerState.lastUpdate = Date.now();
        
        namespace.emit('player:play', data);
      });

      socket.on('player:pause', (data) => {
        data = data || {};
        logger.info(`player:pause via socket ${socket.id} for channel ${channelId} (time=${data.time ?? 'n/a'})`);
        // Update player state
        if (!namespace._playerState) {
          namespace._playerState = {};
        }
        namespace._playerState.playing = false;
        if (typeof data.time === 'number') {
          namespace._playerState.time = data.time;
        }
        namespace._playerState.lastUpdate = Date.now();
        
        namespace.emit('player:pause', data);
      });

      socket.on('player:seek', (data) => {
        data = data || {};
        logger.info(`player:seek via socket ${socket.id} for channel ${channelId} (time=${data.time ?? 'n/a'})`);
        // Update player state
        if (!namespace._playerState) {
          namespace._playerState = {};
        }
        if (typeof data.time === 'number') {
          namespace._playerState.time = data.time;
        }
        namespace._playerState.lastUpdate = Date.now();
        
        namespace.emit('player:seek', data);
      });

      socket.on('player:state_request', () => {
        logger.info(`player:state_request from socket ${socket.id} for channel ${channelId}`);
        const state = namespace._playerState || { playing: false, time: 0 };
        socket.emit('player:state_response', state);
      });

      // Overlay player visibility controls
      socket.on('overlay:show_player', () => {
        try {
          if (!namespace._overlayState) {
            namespace._overlayState = { showPlayer: null };
          }
          namespace._overlayState.showPlayer = true;
          namespace._overlayState.lastUpdate = Date.now();
          logger.info(`overlay:show_player for channel ${channelId} by ${socket.id}`);
          namespace.emit('overlay:player_visibility', { showPlayer: true, reason: 'manual' });
        } catch (error) {
          logger.error('Error handling overlay:show_player:', error);
          socket.emit('error', { message: 'Failed to show overlay player' });
        }
      });

      socket.on('overlay:hide_player', () => {
        try {
          if (!namespace._overlayState) {
            namespace._overlayState = { showPlayer: null };
          }
          namespace._overlayState.showPlayer = false;
          namespace._overlayState.lastUpdate = Date.now();
          logger.info(`overlay:hide_player for channel ${channelId} by ${socket.id}`);
          namespace.emit('overlay:player_visibility', { showPlayer: false, reason: 'manual' });
        } catch (error) {
          logger.error('Error handling overlay:hide_player:', error);
          socket.emit('error', { message: 'Failed to hide overlay player' });
        }
      });

      socket.on('overlay:state_request', () => {
        try {
          const current = namespace._overlayState || { showPlayer: null };
          socket.emit('overlay:state_response', current);
        } catch (error) {
          logger.error('Error handling overlay:state_request:', error);
          socket.emit('error', { message: 'Failed to return overlay state' });
        }
      });

      socket.on('status:request', async () => {
        try {
          const [queue, enabled, queueSize, maxSize, volume] = await Promise.all([
            queueService.getCurrentQueue(),
            queueService.isQueueEnabled(),
            queueService.getQueueSize(),
            queueService.getSetting('max_queue_size', '50'),
            queueService.getSetting('current_volume', '75')
          ]);

          socket.emit('status:response', {
            queue,
            enabled,
            currentlyPlaying: queueService.currentlyPlaying,
            queueSize,
            maxSize: parseInt(maxSize, 10),
            volume: parseInt(volume, 10)
          });
        } catch (error) {
          logger.error('Error returning queue status:', error);
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('disconnect', (reason) => {
        logger.info(`Client disconnected from channel ${channelId}: ${socket.id} (${reason})`);
      });
    });

    return namespace;
  };

  channelManager.setNamespaceInitializer(setupChannelNamespace);
  channelManager.getAllChannels().forEach((channelId) => setupChannelNamespace(channelId));

  io.on('connection', (socket) => {
    logger.info(`Client connected to main namespace: ${socket.id}`);

    socket.on('channels:list', async () => {
      try {
        const channelIds = channelManager.getAllChannels();
        const channelInfos = [];

        for (const id of channelIds) {
          const info = await channelManager.getChannelInfo(id);
          if (info) {
            channelInfos.push(info);
          }
        }

        socket.emit('channels:list', channelInfos);
      } catch (error) {
        logger.error('Error getting channels list:', error);
        socket.emit('error', { message: 'Failed to load channels' });
      }
    });

    socket.on('channel:join', async (data) => {
      try {
        data = data || {};
        const { channelId } = data;
        if (!channelId) {
          socket.emit('error', { message: 'Channel ID is required' });
          return;
        }

        const queueService = channelManager.getQueueService(channelId);
        if (!queueService) {
          socket.emit('error', { message: 'Channel not found or inactive' });
          return;
        }

        const [queue, enabled] = await Promise.all([
          queueService.getCurrentQueue(),
          queueService.isQueueEnabled()
        ]);

        socket.emit('channel:joined', {
          channelId,
          queue,
          enabled,
          currentlyPlaying: queueService.currentlyPlaying
        });
      } catch (error) {
        logger.error('Error joining channel from main namespace:', error);
        socket.emit('error', { message: 'Failed to join channel' });
      }
    });

    socket.on('stats:global', async () => {
      try {
        const stats = await channelManager.getGlobalStats();
        socket.emit('stats:global', stats);
      } catch (error) {
        logger.error('Error getting global stats:', error);
        socket.emit('error', { message: 'Failed to load global stats' });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected from main namespace: ${socket.id} (${reason})`);
    });
  });

  logger.info('Socket.io handlers configured');
}

module.exports = socketHandler;
