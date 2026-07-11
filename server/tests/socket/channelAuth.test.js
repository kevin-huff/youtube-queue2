const {
  ADMIN_ROLES,
  MODERATION_ROLES,
  PLAYBACK_ROLES,
  expandRoles,
  rolesFromEntry,
  rolesFromSession,
  resolveChannelRoles,
  hasAnyRole
} = require('../../src/socket/channelAuth');

describe('channelAuth helpers', () => {
  describe('role category lists', () => {
    it('include OWNER/MANAGER/PRODUCER in every category', () => {
      [ADMIN_ROLES, MODERATION_ROLES, PLAYBACK_ROLES].forEach((list) => {
        expect(list).toEqual(expect.arrayContaining(['OWNER', 'MANAGER', 'PRODUCER']));
      });
    });

    it('grant MODERATOR moderation access and HOST playback access, but not vice versa', () => {
      expect(MODERATION_ROLES).toContain('MODERATOR');
      expect(MODERATION_ROLES).not.toContain('HOST');
      expect(PLAYBACK_ROLES).toContain('HOST');
      expect(PLAYBACK_ROLES).not.toContain('MODERATOR');
      expect(ADMIN_ROLES).not.toContain('HOST');
      expect(ADMIN_ROLES).not.toContain('MODERATOR');
    });
  });

  describe('expandRoles', () => {
    it('expands OWNER to MANAGER/PRODUCER/HOST', () => {
      const roles = expandRoles(['OWNER']);
      expect(roles.has('OWNER')).toBe(true);
      expect(roles.has('MANAGER')).toBe(true);
      expect(roles.has('PRODUCER')).toBe(true);
      expect(roles.has('HOST')).toBe(true);
    });

    it('expands MANAGER to PRODUCER/HOST but not OWNER', () => {
      const roles = expandRoles(['MANAGER']);
      expect(roles.has('OWNER')).toBe(false);
      expect(roles.has('PRODUCER')).toBe(true);
      expect(roles.has('HOST')).toBe(true);
    });

    it('does not expand HOST, MODERATOR or JUDGE', () => {
      const roles = expandRoles(['HOST', 'MODERATOR', 'JUDGE']);
      expect(roles.has('PRODUCER')).toBe(false);
      expect(roles.has('OWNER')).toBe(false);
      expect(roles.has('MANAGER')).toBe(false);
    });
  });

  describe('rolesFromEntry + hasAnyRole', () => {
    it('channel OWNER passes every category', () => {
      const roles = rolesFromEntry({ ownershipRole: 'OWNER', roles: [] });
      expect(hasAnyRole(roles, ADMIN_ROLES)).toBe(true);
      expect(hasAnyRole(roles, MODERATION_ROLES)).toBe(true);
      expect(hasAnyRole(roles, PLAYBACK_ROLES)).toBe(true);
    });

    it('channel MANAGER passes every category', () => {
      const roles = rolesFromEntry({ ownershipRole: 'MANAGER', roles: [] });
      expect(hasAnyRole(roles, ADMIN_ROLES)).toBe(true);
      expect(hasAnyRole(roles, MODERATION_ROLES)).toBe(true);
      expect(hasAnyRole(roles, PLAYBACK_ROLES)).toBe(true);
    });

    it('PRODUCER show role passes every category', () => {
      const roles = rolesFromEntry({ ownershipRole: null, roles: ['PRODUCER'] });
      expect(hasAnyRole(roles, ADMIN_ROLES)).toBe(true);
      expect(hasAnyRole(roles, MODERATION_ROLES)).toBe(true);
      expect(hasAnyRole(roles, PLAYBACK_ROLES)).toBe(true);
    });

    it('bare HOST passes playback only', () => {
      const roles = rolesFromEntry({ ownershipRole: null, roles: ['HOST'] });
      expect(hasAnyRole(roles, PLAYBACK_ROLES)).toBe(true);
      expect(hasAnyRole(roles, MODERATION_ROLES)).toBe(false);
      expect(hasAnyRole(roles, ADMIN_ROLES)).toBe(false);
    });

    it('bare MODERATOR passes moderation only', () => {
      const roles = rolesFromEntry({ ownershipRole: null, roles: ['MODERATOR'] });
      expect(hasAnyRole(roles, MODERATION_ROLES)).toBe(true);
      expect(hasAnyRole(roles, PLAYBACK_ROLES)).toBe(false);
      expect(hasAnyRole(roles, ADMIN_ROLES)).toBe(false);
    });

    it('JUDGE show role passes nothing', () => {
      const roles = rolesFromEntry({ ownershipRole: null, roles: ['JUDGE'] });
      expect(hasAnyRole(roles, ADMIN_ROLES)).toBe(false);
      expect(hasAnyRole(roles, MODERATION_ROLES)).toBe(false);
      expect(hasAnyRole(roles, PLAYBACK_ROLES)).toBe(false);
    });

    it('empty or missing entries yield no roles', () => {
      expect(rolesFromEntry({ ownershipRole: null, roles: [] }).size).toBe(0);
      expect(rolesFromEntry(null).size).toBe(0);
      expect(rolesFromEntry(undefined).size).toBe(0);
      expect(hasAnyRole(new Set(), ADMIN_ROLES)).toBe(false);
      expect(hasAnyRole(null, ADMIN_ROLES)).toBe(false);
    });
  });

  describe('rolesFromSession', () => {
    const owner = {
      id: 'acct-1',
      channels: [{ id: 'somechannel', ownershipRole: 'OWNER', roles: ['OWNER'] }]
    };

    it('matches the channel case-insensitively', () => {
      expect(rolesFromSession(owner, 'SomeChannel').has('OWNER')).toBe(true);
    });

    it('yields no roles for a different channel', () => {
      expect(rolesFromSession(owner, 'otherchannel').size).toBe(0);
    });

    it('yields no roles for anonymous users', () => {
      expect(rolesFromSession(null, 'somechannel').size).toBe(0);
      expect(rolesFromSession({}, 'somechannel').size).toBe(0);
    });
  });

  describe('resolveChannelRoles', () => {
    const user = {
      id: 'acct-1',
      username: 'streamer',
      channels: [{ id: 'somechannel', ownershipRole: 'OWNER', roles: ['OWNER'] }]
    };

    it('uses the DB lookup when a channelManager is available', async () => {
      const channelManager = {
        getUserChannels: jest.fn().mockResolvedValue([
          { channelId: 'somechannel', ownershipRole: null, roles: ['HOST'] }
        ])
      };
      const roles = await resolveChannelRoles({ user, channelId: 'somechannel', channelManager });
      expect(roles.has('HOST')).toBe(true);
      expect(roles.has('OWNER')).toBe(false);
      expect(channelManager.getUserChannels).toHaveBeenCalledWith('acct-1', { withRoles: true });
    });

    it('treats the DB lookup as authoritative over the session payload', async () => {
      // Session says OWNER but the DB no longer has any roles — no roles
      const channelManager = {
        getUserChannels: jest.fn().mockResolvedValue([])
      };
      const roles = await resolveChannelRoles({ user, channelId: 'somechannel', channelManager });
      expect(roles.size).toBe(0);
    });

    it('falls back to the session payload if the DB lookup fails', async () => {
      const channelManager = {
        getUserChannels: jest.fn().mockRejectedValue(new Error('db down'))
      };
      const roles = await resolveChannelRoles({ user, channelId: 'somechannel', channelManager });
      expect(roles.has('OWNER')).toBe(true);
    });

    it('uses the session payload when no channelManager is provided', async () => {
      const withChannel = await resolveChannelRoles({
        user, channelId: 'somechannel', channelManager: null
      });
      expect(withChannel.has('OWNER')).toBe(true);

      const otherChannel = await resolveChannelRoles({
        user, channelId: 'otherchannel', channelManager: null
      });
      expect(otherChannel.size).toBe(0);
    });

    it('yields no roles for anonymous users', async () => {
      const roles = await resolveChannelRoles({
        user: null, channelId: 'somechannel', channelManager: {}
      });
      expect(roles.size).toBe(0);
    });
  });
});
