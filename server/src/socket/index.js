const logger = require('../utils/logger');

function socketHandler(io, channelManager) {
  const setupChannelNamespace = (channelId, providedNamespace) => {
    const namespacePath = `/channel/${channelId}`;
    const namespace = providedNamespace || io.of(namespacePath);

    if (namespace._queueListenersAttached) {
      return namespace;
    }

    namespace._queueListenersAttached = true;

    namespace.on('connection', (socket) => {
      logger.info(`Client connected to channel ${channelId}: ${socket.id}`);

      const queueService = channelManager.getQueueService(channelId);
      if (!queueService) {
        socket.emit('error', { message: 'Queue service not available' });
        socket.disconnect(true);
        return;
      }

      // Allow clients to request the current queue state
      socket.on('queue:join', async () => {
        try {
          const [queue, enabled] = await Promise.all([
            queueService.getCurrentQueue(),
            queueService.isQueueEnabled()
          ]);

          socket.emit('queue:initial_state', {
            queue,
            enabled,
            currentlyPlaying: queueService.currentlyPlaying,
            votingState: queueService.getVotingState()
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
