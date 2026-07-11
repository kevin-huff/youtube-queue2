const logger = require('../utils/logger');

// Channel-level authorization helpers for socket connections.
//
// Mirrors the role model used by the REST layer (see requireChannelRole in
// ../auth/middleware.js and the role lists in ../api/queue.routes.js):
// channel OWNER/MANAGER come from ChannelOwner rows, show roles
// (PRODUCER/HOST/MODERATOR/JUDGE) from ChannelRoleAssignment rows, with the
// same role expansion the REST middleware applies (OWNER implies
// MANAGER/PRODUCER/HOST, MANAGER implies PRODUCER/HOST).

// Role lists per socket event category — kept in sync with the REST routes.
// OWNER/MANAGER/PRODUCER are listed explicitly in every category so role
// expansion nuances don't matter.
const ADMIN_ROLES = ['OWNER', 'MANAGER', 'PRODUCER'];
const MODERATION_ROLES = ['OWNER', 'MANAGER', 'PRODUCER', 'MODERATOR'];
const PLAYBACK_ROLES = ['OWNER', 'MANAGER', 'PRODUCER', 'HOST'];

const normalizeChannelId = (channelId) => (channelId || '').toString().trim().toLowerCase();

// Same expansion rules as requireChannelRole in ../auth/middleware.js
const expandRoles = (roles) => {
  const s = new Set(
    Array.from(roles || [])
      .map((role) => (role ? role.toString().toUpperCase() : null))
      .filter(Boolean)
  );
  if (s.has('OWNER')) {
    s.add('MANAGER');
    s.add('PRODUCER');
    s.add('HOST');
  }
  if (s.has('MANAGER')) {
    s.add('PRODUCER');
    s.add('HOST');
  }
  return s;
};

// entry: { ownershipRole, roles } as produced by both passport's
// buildUserPayload (user.channels[]) and ChannelManager.getUserChannels
const rolesFromEntry = (entry) => {
  if (!entry) {
    return new Set();
  }
  const combined = [...(entry.roles || [])];
  if (entry.ownershipRole) {
    combined.push(entry.ownershipRole);
  }
  return expandRoles(combined);
};

// Derive the expanded role set from the session user payload
// (auth/passport.js buildUserPayload) — the same source requireChannelRole reads.
const rolesFromSession = (user, channelId) => {
  if (!user || !Array.isArray(user.channels)) {
    return new Set();
  }
  const normalized = normalizeChannelId(channelId);
  const context = user.channels.find(
    (channel) => normalizeChannelId(channel && channel.id) === normalized
  );
  return rolesFromEntry(context);
};

// Resolve the expanded set of roles `user` holds on `channelId`. Prefers an
// authoritative DB lookup (ChannelOwner + non-expired ChannelRoleAssignment
// rows via ChannelManager.getUserChannels); falls back to the session payload
// only if the lookup fails. Callers cache the result per connection — role
// changes take effect on the next connect/reconnect.
async function resolveChannelRoles({ user, channelId, channelManager }) {
  if (!user || !user.id) {
    return new Set();
  }

  const normalized = normalizeChannelId(channelId);

  if (channelManager && typeof channelManager.getUserChannels === 'function') {
    try {
      const entries = await channelManager.getUserChannels(user.id, { withRoles: true });
      const entry = (entries || []).find(
        (item) => normalizeChannelId(item && item.channelId) === normalized
      );
      return rolesFromEntry(entry);
    } catch (error) {
      logger.error(`Failed to resolve channel roles for socket auth (channel ${normalized}):`, error);
      // Fall back to the session payload rather than hard-failing the connection
      return rolesFromSession(user, normalized);
    }
  }

  return rolesFromSession(user, normalized);
}

const hasAnyRole = (roleSet, allowedRoles) =>
  Boolean(roleSet) && (allowedRoles || []).some((role) => roleSet.has(role));

module.exports = {
  ADMIN_ROLES,
  MODERATION_ROLES,
  PLAYBACK_ROLES,
  expandRoles,
  rolesFromEntry,
  rolesFromSession,
  resolveChannelRoles,
  hasAnyRole
};
