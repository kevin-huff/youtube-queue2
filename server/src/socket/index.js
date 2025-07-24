const logger = require('../utils/logger');

function socketHandler(io, queueService) {
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Send current queue state to new client
    socket.on('queue:join', async () => {
      try {
        const currentQueue = await queueService.getCurrentQueue();
        const isEnabled = await queueService.isQueueEnabled();
        const currentlyPlaying = queueService.currentlyPlaying;
        
        socket.emit('queue:initial_state', {
          queue: currentQueue,
          enabled: isEnabled,
          currentlyPlaying: currentlyPlaying
        });
        
        logger.debug(`Sent initial queue state to ${socket.id}`);
      } catch (error) {
        logger.error('Error sending initial queue state:', error);
        socket.emit('error', { message: 'Failed to load queue state' });
      }
    });

    // Queue management events
    socket.on('queue:add', async (data) => {
      try {
        const { url, submitter } = data;
        
        if (!url || !submitter) {
          socket.emit('error', { message: 'URL and submitter are required' });
          return;
        }

        // This would typically be handled by the Twitch bot
        // But we can also allow manual additions from the admin interface
        logger.info(`Manual video addition requested: ${url} by ${submitter}`);
        socket.emit('error', { message: 'Manual additions not implemented yet' });
      } catch (error) {
        logger.error('Error adding video to queue:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('queue:remove', async (data) => {
      try {
        const { itemId, removedBy = 'admin' } = data;
        
        if (!itemId) {
          socket.emit('error', { message: 'Item ID is required' });
          return;
        }

        await queueService.removeFromQueue(itemId, removedBy);
        logger.info(`Video removed from queue: ${itemId} by ${removedBy}`);
      } catch (error) {
        logger.error('Error removing video from queue:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('queue:reorder', async (data) => {
      try {
        const { newOrder } = data;
        
        if (!Array.isArray(newOrder)) {
          socket.emit('error', { message: 'New order must be an array' });
          return;
        }

        await queueService.reorderQueue(newOrder);
        logger.info('Queue reordered via socket');
      } catch (error) {
        logger.error('Error reordering queue:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('queue:play_next', async () => {
      try {
        const nextVideo = await queueService.playNext();
        logger.info(`Next video requested via socket: ${nextVideo?.title || 'none'}`);
      } catch (error) {
        logger.error('Error playing next video:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('queue:skip', async (data) => {
      try {
        const { skippedBy = 'admin' } = data || {};
        const nextVideo = await queueService.skipCurrent(skippedBy);
        logger.info(`Video skipped via socket by ${skippedBy}`);
      } catch (error) {
        logger.error('Error skipping video:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('queue:clear', async (data) => {
      try {
        const { clearedBy = 'admin' } = data || {};
        await queueService.clearQueue(clearedBy);
        logger.info(`Queue cleared via socket by ${clearedBy}`);
      } catch (error) {
        logger.error('Error clearing queue:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('queue:mark_played', async (data) => {
      try {
        const { itemId } = data;
        
        if (!itemId) {
          socket.emit('error', { message: 'Item ID is required' });
          return;
        }

        await queueService.markAsPlayed(itemId);
        logger.info(`Video marked as played via socket: ${itemId}`);
      } catch (error) {
        logger.error('Error marking video as played:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Settings management
    socket.on('settings:update', async (data) => {
      try {
        const { key, value } = data;
        
        if (!key || value === undefined) {
          socket.emit('error', { message: 'Key and value are required' });
          return;
        }

        await queueService.updateSetting(key, value);
        logger.info(`Setting updated via socket: ${key} = ${value}`);
      } catch (error) {
        logger.error('Error updating setting:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('settings:get', async (data) => {
      try {
        const { key } = data;
        
        if (!key) {
          socket.emit('error', { message: 'Key is required' });
          return;
        }

        const value = await queueService.getSetting(key);
        socket.emit('settings:value', { key, value });
      } catch (error) {
        logger.error('Error getting setting:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Volume control
    socket.on('volume:change', async (data) => {
      try {
        const { volume } = data;
        
        if (typeof volume !== 'number' || volume < 0 || volume > 100) {
          socket.emit('error', { message: 'Volume must be a number between 0 and 100' });
          return;
        }

        await queueService.updateSetting('current_volume', volume);
        logger.info(`Volume changed via socket: ${volume}%`);
      } catch (error) {
        logger.error('Error changing volume:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('volume:get', async () => {
      try {
        const volume = await queueService.getSetting('current_volume', '75');
        socket.emit('volume:current', { volume: parseInt(volume) });
      } catch (error) {
        logger.error('Error getting volume:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Admin actions
    socket.on('admin:enable_queue', async () => {
      try {
        await queueService.enableQueue(true);
        logger.info('Queue enabled via socket');
      } catch (error) {
        logger.error('Error enabling queue:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('admin:disable_queue', async () => {
      try {
        await queueService.enableQueue(false);
        logger.info('Queue disabled via socket');
      } catch (error) {
        logger.error('Error disabling queue:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Request current status
    socket.on('status:request', async () => {
      try {
        const currentQueue = await queueService.getCurrentQueue();
        const isEnabled = await queueService.isQueueEnabled();
        const queueSize = await queueService.getQueueSize();
        const maxSize = await queueService.getSetting('max_queue_size', '50');
        const volume = await queueService.getSetting('current_volume', '75');
        
        socket.emit('status:response', {
          queue: currentQueue,
          enabled: isEnabled,
          currentlyPlaying: queueService.currentlyPlaying,
          queueSize: queueSize,
          maxSize: parseInt(maxSize),
          volume: parseInt(volume)
        });
      } catch (error) {
        logger.error('Error getting status:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id} (${reason})`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  // Periodic cleanup and status broadcast
  setInterval(async () => {
    try {
      const connectedClients = io.sockets.sockets.size;
      if (connectedClients > 0) {
        const currentQueue = await queueService.getCurrentQueue();
        const isEnabled = await queueService.isQueueEnabled();
        
        io.emit('queue:heartbeat', {
          queue: currentQueue,
          enabled: isEnabled,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error('Error in periodic status broadcast:', error);
    }
  }, 30000); // Every 30 seconds

  logger.info('Socket.io handlers configured');
}

module.exports = socketHandler;
