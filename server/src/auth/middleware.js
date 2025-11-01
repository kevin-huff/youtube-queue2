const logger = require('../utils/logger');

const normalizeChannelId = (channelId) => (channelId || '').toString().trim().toLowerCase();

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

const findChannelContext = (req, channelId) => {
  if (!req.user || !Array.isArray(req.user.channels)) {
    return null;
  }

  if (!channelId) {
    return req.user.channels[0] || null;
  }

  const normalized = normalizeChannelId(channelId);
  return req.user.channels.find((channel) => normalizeChannelId(channel.id) === normalized) || null;
};

const ensureChannelContext = (req, channelId) => {
  const context = findChannelContext(req, channelId);
  if (context) {
    req.channelId = context.id;
    req.channelAccess = context;
  }
  return context;
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
    const normalizedChannelId = normalizeChannelId(requestedChannelId);

    if (!accountId) {
      return res.status(401).json({
        error: 'Authentication required',
        requiresLogin: true
      });
    }

    let ownedChannelIds = [];
    const channelManager = req.app?.get?.('channelManager');

    const sessionContext = ensureChannelContext(req, requestedChannelId);
    if (sessionContext) {
      return next();
    }

    if (channelManager && typeof channelManager.getUserChannels === 'function') {
      ownedChannelIds = await channelManager.getUserChannels(accountId);
    } else {
      ownedChannelIds = getCachedChannelIds(req);
    }

    if (!ownedChannelIds.length) {
      logger.warn(`Account ${accountId} attempted to access channel ${requestedChannelId || '(none)'} but owns no channels.`);
    }

    if (!requestedChannelId) {
      const fallbackChannelId = ownedChannelIds[0] || null;
      req.channelId = fallbackChannelId ? normalizeChannelId(fallbackChannelId) : null;
      return next();
    }

    if (!ownedChannelIds.includes(normalizedChannelId)) {
      logger.warn(`Account ${accountId} attempted to access unauthorized channel ${requestedChannelId}`);
      return res.status(403).json({
        error: 'Access denied. You can only access channels you own or manage.'
      });
    }

    req.channelId = normalizedChannelId;
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
    const context = ensureChannelContext(req, req.channelId);
    if (!context) {
      const channelIds = getCachedChannelIds(req);
      req.channelId = channelIds[0] || null;
    }
  }
  next();
};

// Middleware for optional authentication (user might or might not be logged in)
const optionalAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    ensureChannelContext(req, req.channelId);
    if (!req.channelId) {
      const channelIds = getCachedChannelIds(req);
      req.channelId = channelIds[0] || null;
    }
  }
  next();
};

const resolveChannelAccess = (req, options = {}) => {
  const {
    channelId: explicitChannelId,
    allowFallback = true
  } = options;

  const channelId =
    explicitChannelId ||
    req.params?.channelId ||
    req.body?.channelId ||
    req.query?.channelId ||
    req.channelId ||
    null;

  const access = findChannelContext(req, channelId);
  if (!access && allowFallback) {
    return findChannelContext(req, null);
  }
  return access;
};

const toArray = (value) => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const requireChannelRole = (requiredRoles, options = {}) => {
  const normalizedRequiredRoles = toArray(requiredRoles).map((role) => role && role.toString());
  const {
    match = 'any',
    allowOwnership = true,
    allowFallback = true,
    channelId
  } = options;

  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Authentication required',
        requiresLogin: true
      });
    }

    const channelAccess = resolveChannelAccess(req, { channelId, allowFallback });

    if (!channelAccess) {
      return res.status(403).json({
        error: 'Access denied to this channel'
      });
    }

    const availableRoles = new Set(channelAccess.roles || []);

    if (allowOwnership && channelAccess.ownershipRole) {
      availableRoles.add(channelAccess.ownershipRole);

      // Ownership shortcuts: owners and managers inherit producer/host powers.
      if (channelAccess.ownershipRole === 'OWNER') {
        ['MANAGER', 'PRODUCER', 'HOST'].forEach((role) => availableRoles.add(role));
      } else if (channelAccess.ownershipRole === 'MANAGER') {
        ['PRODUCER', 'HOST'].forEach((role) => availableRoles.add(role));
      }
    }

    const hasMatch =
      match === 'all'
        ? normalizedRequiredRoles.every((role) => availableRoles.has(role))
        : normalizedRequiredRoles.some((role) => availableRoles.has(role));

    if (!hasMatch) {
      return res.status(403).json({
        error: 'Insufficient channel permissions',
        requiredRoles: normalizedRequiredRoles
      });
    }

    req.channelId = channelAccess.id;
    req.channelAccess = channelAccess;

    return next();
  };
};

const requireCupRole = (requiredRoles, options = {}) => {
  const normalizedRequiredRoles = toArray(requiredRoles).map((role) => role && role.toString());
  const {
    match = 'any',
    allowChannelFallback = true,
    cupId: explicitCupId
  } = options;

  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Authentication required',
        requiresLogin: true
      });
    }

    const channelAccess = resolveChannelAccess(req, options);
    if (!channelAccess) {
      return res.status(403).json({
        error: 'Access denied to this channel'
      });
    }

    const cupId =
      explicitCupId ||
      req.params?.cupId ||
      req.body?.cupId ||
      req.query?.cupId;

    if (!cupId) {
      return res.status(400).json({
        error: 'Cup ID is required for this operation'
      });
    }

    const cupRoles = new Set((channelAccess.cupRoles && channelAccess.cupRoles[cupId]) || []);
    let hasMatch =
      match === 'all'
        ? normalizedRequiredRoles.every((role) => cupRoles.has(role))
        : normalizedRequiredRoles.some((role) => cupRoles.has(role));

    if (!hasMatch && allowChannelFallback) {
      const availableRoles = new Set(channelAccess.roles || []);
      if (channelAccess.ownershipRole) {
        availableRoles.add(channelAccess.ownershipRole);
      }

      hasMatch =
        match === 'all'
          ? normalizedRequiredRoles.every((role) => availableRoles.has(role))
          : normalizedRequiredRoles.some((role) => availableRoles.has(role));
    }

    if (!hasMatch) {
      return res.status(403).json({
        error: 'Insufficient cup permissions',
        requiredRoles: normalizedRequiredRoles
      });
    }

    req.channelId = channelAccess.id;
    req.channelAccess = channelAccess;
    req.cupId = cupId;

    return next();
  };
};

module.exports = {
  ensureAuthenticated,
  ensureChannelOwnership,
  addChannelId,
  optionalAuth,
  requireAuth: ensureAuthenticated,
  requireChannelRole,
  requireCupRole
};
