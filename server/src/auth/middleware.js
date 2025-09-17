const logger = require('../utils/logger');

const getCachedChannelIds = (req) => {
  if (!req.user || !Array.isArray(req.user.channels)) {
    return [];
  }

  return req.user.channels
    .map((channel) => {
      if (typeof channel === 'string') {
        return channel;
      }
      if (channel && typeof channel === 'object') {
        return channel.id;
      }
      return null;
    })
    .filter(Boolean);
};

// Middleware to ensure user is authenticated
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required',
    requiresLogin: true
  });
};

// Middleware to ensure user owns the channel they're accessing
const ensureChannelOwnership = async (req, res, next) => {
  try {
    const requestedChannelId = req.params.channelId || req.body.channelId || req.query.channelId;
    const accountId = req.user?.id;

    if (!accountId) {
      return res.status(401).json({
        error: 'Authentication required',
        requiresLogin: true
      });
    }

    let ownedChannelIds = [];
    const channelManager = req.app?.get?.('channelManager');

    if (channelManager && typeof channelManager.getUserChannels === 'function') {
      ownedChannelIds = await channelManager.getUserChannels(accountId);
    } else {
      ownedChannelIds = getCachedChannelIds(req);
    }

    if (!ownedChannelIds.length) {
      logger.warn(`Account ${accountId} attempted to access channel ${requestedChannelId || '(none)'} but owns no channels.`);
    }

    if (!requestedChannelId) {
      req.channelId = ownedChannelIds[0] || null;
      return next();
    }

    if (!ownedChannelIds.includes(requestedChannelId)) {
      logger.warn(`Account ${accountId} attempted to access unauthorized channel ${requestedChannelId}`);
      return res.status(403).json({
        error: 'Access denied. You can only access channels you own or manage.'
      });
    }

    req.channelId = requestedChannelId;
    return next();
  } catch (error) {
    logger.error('Error validating channel ownership:', error);
    return res.status(500).json({
      error: 'Failed to verify channel ownership'
    });
  }
};

// Middleware to add channel ID to request for authenticated users
const addChannelId = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const channelIds = getCachedChannelIds(req);
    req.channelId = channelIds[0] || null;
  }
  next();
};

// Middleware for optional authentication (user might or might not be logged in)
const optionalAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const channelIds = getCachedChannelIds(req);
    req.channelId = channelIds[0] || null;
  }
  next();
};

module.exports = {
  ensureAuthenticated,
  ensureChannelOwnership,
  addChannelId,
  optionalAuth,
  requireAuth: ensureAuthenticated
};
