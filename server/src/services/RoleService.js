const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');

const normalizeChannelId = (channelId) => (channelId || '').toString().trim().toLowerCase();

class RoleService {
  constructor(prisma = null) {
    this.prisma = prisma;
  }

  get client() {
    if (this.prisma) {
      return this.prisma;
    }
    return getDatabase();
  }

  async assignChannelRole({
    channelId,
    accountId,
    role,
    cupId = null,
    assignedBy = null,
    expiresAt = null
  }) {
    const normalizedChannelId = normalizeChannelId(channelId);

    if (!normalizedChannelId) {
      throw new Error('Channel ID is required to assign a role');
    }

    if (!accountId) {
      throw new Error('Account ID is required to assign a role');
    }

    if (!role) {
      throw new Error('Role is required to assign a role');
    }

    const client = this.client;

    try {
      const existing = await client.channelRoleAssignment.findFirst({
        where: {
          channelId: normalizedChannelId,
          accountId,
          role,
          cupId: cupId || null
        }
      });

      if (existing) {
        return client.channelRoleAssignment.update({
          where: { id: existing.id },
          data: {
            expiresAt,
            assignedBy
          },
          include: {
            channel: true,
            cup: true,
            account: {
              select: {
                id: true,
                username: true,
                displayName: true,
                profileImageUrl: true
              }
            }
          }
        });
      }

      return client.channelRoleAssignment.create({
        data: {
          channelId: normalizedChannelId,
          accountId,
          role,
          cupId,
          assignedBy,
          expiresAt
        },
        include: {
          channel: true,
          cup: true,
          account: {
            select: {
              id: true,
              username: true,
              displayName: true,
              profileImageUrl: true
            }
          }
        }
      });
    } catch (error) {
      logger.error('Failed to assign channel role', {
        channelId: normalizedChannelId,
        accountId,
        role,
        cupId,
        error
      });
      throw error;
    }
  }

  async revokeChannelRole({
    channelId,
    accountId,
    role,
    cupId = null
  }) {
    const normalizedChannelId = normalizeChannelId(channelId);

    if (!normalizedChannelId || !accountId || !role) {
      throw new Error('channelId, accountId, and role are required to revoke a role');
    }

    const client = this.client;

    try {
      await client.channelRoleAssignment.deleteMany({
        where: {
          channelId: normalizedChannelId,
          accountId,
          role,
          cupId: cupId || null
        }
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        // No-op if the assignment did not exist
        return;
      }

      logger.error('Failed to revoke channel role', {
        channelId: normalizedChannelId,
        accountId,
        role,
        cupId,
        error
      });
      throw error;
    }
  }

  async listChannelRoles(channelId, { includeExpired = false } = {}) {
    const normalizedChannelId = normalizeChannelId(channelId);

    if (!normalizedChannelId) {
      throw new Error('Channel ID is required to list roles');
    }

    const now = new Date();
    const client = this.client;

    const assignments = await client.channelRoleAssignment.findMany({
      where: {
        channelId: normalizedChannelId,
        ...(includeExpired
          ? {}
          : {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } }
              ]
            })
      },
      include: {
        account: {
          select: {
            id: true,
            username: true,
            displayName: true,
            profileImageUrl: true
          }
        },
        cup: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            startsAt: true,
            endsAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return assignments;
  }

  async getAccountRoles(accountId, { includeExpired = false } = {}) {
    if (!accountId) {
      throw new Error('Account ID is required to lookup roles');
    }

    const now = new Date();
    const client = this.client;

    const assignments = await client.channelRoleAssignment.findMany({
      where: {
        accountId,
        ...(includeExpired
          ? {}
          : {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } }
              ]
            })
      },
      include: {
        channel: true,
        cup: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            startsAt: true,
            endsAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const rolesByChannel = new Map();

    assignments.forEach((assignment) => {
      const channelId = normalizeChannelId(assignment.channelId);
      if (!channelId) {
        return;
      }

      if (!rolesByChannel.has(channelId)) {
        rolesByChannel.set(channelId, {
          channelId,
          channel: assignment.channel
            ? {
                id: assignment.channel.id,
                displayName: assignment.channel.displayName,
                profileImageUrl: assignment.channel.profileImageUrl,
                isActive: assignment.channel.isActive
              }
            : null,
          roles: new Set(),
          cupRoles: new Map()
        });
      }

      const entry = rolesByChannel.get(channelId);
      entry.roles.add(assignment.role);

      if (assignment.cupId) {
        const cupRoleSet = entry.cupRoles.get(assignment.cupId) || new Set();
        cupRoleSet.add(assignment.role);
        entry.cupRoles.set(assignment.cupId, cupRoleSet);
      }
    });

    return Array.from(rolesByChannel.values()).map((entry) => ({
      channelId: entry.channelId,
      channel: entry.channel,
      roles: Array.from(entry.roles),
      cupRoles: Array.from(entry.cupRoles.entries()).reduce((acc, [cupId, rolesSet]) => {
        acc[cupId] = Array.from(rolesSet);
        return acc;
      }, {})
    }));
  }
}

module.exports = RoleService;
