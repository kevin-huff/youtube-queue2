const { body } = require('express-validator');
const logger = require('../utils/logger');
const { requireAuth } = require('../auth/middleware');

module.exports = (router, { helpers }) => {
  const {
    getChannelManager,
    ensureOwnerOrManager,
    ensureOwnerOnly,
    validate,
    formatRoleAssignment,
    formatChannelOwner,
    formatRoleInvite
  } = helpers;

  router.get('/channels/:channelId/roles',
    requireAuth,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const roleService = req.app.get('roleService');
        if (!roleService) {
          return res.status(500).json({ error: 'Role service not available' });
        }

        const normalizedChannelId = await ensureOwnerOrManager(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const [owners, assignments, invites] = await Promise.all([
          channelManager.prisma.channelOwner.findMany({
            where: { channelId: normalizedChannelId },
            include: {
              account: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  profileImageUrl: true
                }
              }
            },
            orderBy: [
              { role: 'asc' },
              { createdAt: 'asc' }
            ]
          }),
          channelManager.prisma.channelRoleAssignment.findMany({
            where: { channelId: normalizedChannelId },
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
                  status: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }),
          channelManager.prisma.channelRoleInvite.findMany({
            where: { channelId: normalizedChannelId },
            include: {
              assignedByAccount: {
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
                  status: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          })
        ]);

        res.json({
          owners: owners.map(formatChannelOwner),
          roles: assignments.map(formatRoleAssignment),
          invites: invites.map(formatRoleInvite)
        });
      } catch (error) {
        logger.error('Error listing channel roles:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to load channel roles' });
      }
    }
  );

  // Add a channel manager (owner-only)
  router.post('/channels/:channelId/owners',
    requireAuth,
    [
      body('username').optional().isString().trim(),
      body('accountId').optional().isString(),
      body('role').optional().isString()
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await ensureOwnerOnly(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const rawRole = (req.body.role || 'MANAGER').toString().trim().toUpperCase();
        if (rawRole !== 'MANAGER') {
          return res.status(400).json({ error: 'Only MANAGER role can be granted via this endpoint' });
        }

        let targetAccountId = (req.body.accountId || '').toString().trim();
        const username = (req.body.username || '').toString().trim();

        if (!targetAccountId && !username) {
          return res.status(400).json({ error: 'Username or accountId is required' });
        }

        if (!targetAccountId) {
          const account = await channelManager.prisma.account.findFirst({
            where: {
              OR: [
                { username: { equals: username, mode: 'insensitive' } },
                { displayName: { equals: username, mode: 'insensitive' } }
              ]
            }
          });

          if (!account) {
            return res.status(404).json({ error: 'Account not found' });
          }

          targetAccountId = account.id;
        }

        // Prevent demoting an owner inadvertently
        const existing = await channelManager.prisma.channelOwner.findUnique({
          where: {
            accountId_channelId: {
              accountId: targetAccountId,
              channelId: normalizedChannelId
            }
          }
        });

        if (existing && existing.role === 'OWNER') {
          return res.status(400).json({ error: 'Target is already an owner; cannot change owner to manager' });
        }

        const ownerRecord = await channelManager.prisma.channelOwner.upsert({
          where: {
            accountId_channelId: {
              accountId: targetAccountId,
              channelId: normalizedChannelId
            }
          },
          update: { role: 'MANAGER' },
          create: {
            accountId: targetAccountId,
            channelId: normalizedChannelId,
            role: 'MANAGER'
          },
          include: {
            account: {
              select: { id: true, username: true, displayName: true, profileImageUrl: true }
            }
          }
        });

        return res.status(201).json({ owner: formatChannelOwner(ownerRecord) });
      } catch (error) {
        logger.error('Error adding channel manager:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to add manager' });
      }
    }
  );

  // Remove a channel manager (owner-only). Only MANAGER records can be removed here.
  router.delete('/channels/:channelId/owners/:ownerId',
    requireAuth,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await ensureOwnerOnly(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const ownerId = parseInt(req.params.ownerId, 10);
        if (!Number.isInteger(ownerId)) {
          return res.status(400).json({ error: 'Invalid owner record ID' });
        }

        const record = await channelManager.prisma.channelOwner.findUnique({ where: { id: ownerId } });
        if (!record || record.channelId !== normalizedChannelId) {
          return res.status(404).json({ error: 'Owner record not found' });
        }

        if (record.role !== 'MANAGER') {
          return res.status(400).json({ error: 'Only MANAGER records can be removed via this endpoint' });
        }

        await channelManager.prisma.channelOwner.delete({ where: { id: ownerId } });
        return res.json({ success: true });
      } catch (error) {
        logger.error('Error removing channel manager:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to remove manager' });
      }
    }
  );

  router.post('/channels/:channelId/roles',
    requireAuth,
    [
      body('role').isString().withMessage('Role is required'),
      body('username').optional().isString().trim(),
      body('accountId').optional().isString(),
      body('cupId').optional().isString(),
      body('expiresAt').optional().isISO8601().withMessage('expiresAt must be a valid ISO date'),
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const roleService = req.app.get('roleService');
        if (!roleService) {
          return res.status(500).json({ error: 'Role service not available' });
        }

        const normalizedChannelId = await ensureOwnerOrManager(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const rawRole = (req.body.role || '').toString().trim().toUpperCase();
        const allowedRoles = ['PRODUCER', 'HOST', 'JUDGE', 'MODERATOR'];
        if (!allowedRoles.includes(rawRole)) {
          return res.status(400).json({ error: 'Invalid role selection' });
        }

        let targetAccountId = (req.body.accountId || '').toString().trim();
        const username = (req.body.username || '').toString().trim();

        if (!targetAccountId && !username) {
          return res.status(400).json({ error: 'Username or accountId is required' });
        }

        if (!targetAccountId) {
          const account = await channelManager.prisma.account.findFirst({
            where: {
              OR: [
                {
                  username: {
                    equals: username,
                    mode: 'insensitive'
                  }
                },
                {
                  displayName: {
                    equals: username,
                    mode: 'insensitive'
                  }
                }
              ]
            }
          });

          if (!account) {
            // No account yet -- create a role invite instead
            const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
            const lowerUsername = username.toLowerCase();

            let invite;
            if (req.body.cupId) {
              // Cup-scoped invite: safe to upsert on composite unique
              invite = await channelManager.prisma.channelRoleInvite.upsert({
                where: {
                  channelId_invitedUsername_role_cupId: {
                    channelId: normalizedChannelId,
                    invitedUsername: lowerUsername,
                    role: rawRole,
                    cupId: req.body.cupId
                  }
                },
                update: {
                  assignedBy: req.user.id,
                  expiresAt
                },
                create: {
                  channelId: normalizedChannelId,
                  invitedUsername: lowerUsername,
                  role: rawRole,
                  cupId: req.body.cupId,
                  assignedBy: req.user.id,
                  expiresAt
                },
                include: {
                  assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                  cup: { select: { id: true, title: true, slug: true, status: true } }
                }
              });
            } else {
              // Global (no cup) invite: cannot upsert by composite (cupId is null). Manually find-or-create
              const existing = await channelManager.prisma.channelRoleInvite.findFirst({
                where: {
                  channelId: normalizedChannelId,
                  invitedUsername: lowerUsername,
                  role: rawRole,
                  cupId: null
                },
                include: {
                  assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                  cup: { select: { id: true, title: true, slug: true, status: true } }
                }
              });
              if (existing) {
                invite = await channelManager.prisma.channelRoleInvite.update({
                  where: { id: existing.id },
                  data: { assignedBy: req.user.id, expiresAt },
                  include: {
                    assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                    cup: { select: { id: true, title: true, slug: true, status: true } }
                  }
                });
              } else {
                invite = await channelManager.prisma.channelRoleInvite.create({
                  data: {
                    channelId: normalizedChannelId,
                    invitedUsername: lowerUsername,
                    role: rawRole,
                    cupId: null,
                    assignedBy: req.user.id,
                    expiresAt
                  },
                  include: {
                    assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                    cup: { select: { id: true, title: true, slug: true, status: true } }
                  }
                });
              }
            }

            return res.status(201).json({ invite: formatRoleInvite(invite) });
          }

          targetAccountId = account.id;
        }

        const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) {
          return res.status(400).json({ error: 'expiresAt must be a valid date' });
        }

        const assignment = await roleService.assignChannelRole({
          channelId: normalizedChannelId,
          accountId: targetAccountId,
          role: rawRole,
          cupId: req.body.cupId || null,
          assignedBy: req.user.id,
          expiresAt
        });

        res.status(201).json({
          role: formatRoleAssignment(assignment)
        });
      } catch (error) {
        logger.error('Error assigning channel role:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to assign channel role' });
      }
    }
  );

  // Role invite endpoints
  router.get('/channels/:channelId/role-invites',
    requireAuth,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await ensureOwnerOrManager(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const invites = await channelManager.prisma.channelRoleInvite.findMany({
          where: { channelId: normalizedChannelId },
          include: {
            assignedByAccount: {
              select: { id: true, username: true, displayName: true, profileImageUrl: true }
            },
            cup: {
              select: { id: true, title: true, slug: true, status: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        });

        res.json({ invites: invites.map(formatRoleInvite) });
      } catch (error) {
        logger.error('Error listing role invites:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to load role invites' });
      }
    }
  );

  router.post('/channels/:channelId/role-invites',
    requireAuth,
    [
      body('username').isString().trim().withMessage('Username is required'),
      body('role').isString().withMessage('Role is required'),
      body('cupId').optional().isString(),
      body('expiresAt').optional().isISO8601().withMessage('expiresAt must be a valid ISO date'),
      body('note').optional().isString()
    ],
    validate,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await ensureOwnerOrManager(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const username = (req.body.username || '').toString().trim();
        const rawRole = (req.body.role || '').toString().trim().toUpperCase();
        const allowedRoles = ['PRODUCER', 'HOST', 'JUDGE', 'MODERATOR'];
        if (!allowedRoles.includes(rawRole)) {
          return res.status(400).json({ error: 'Invalid role selection' });
        }

        const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) {
          return res.status(400).json({ error: 'expiresAt must be a valid date' });
        }

        // If the account already exists, assign immediately instead of inviting
        const existingAccount = await channelManager.prisma.account.findFirst({
          where: {
            OR: [
              { username: { equals: username, mode: 'insensitive' } },
              { displayName: { equals: username, mode: 'insensitive' } }
            ]
          }
        });

        if (existingAccount) {
          const roleService = req.app.get('roleService');
          const assignment = await roleService.assignChannelRole({
            channelId: normalizedChannelId,
            accountId: existingAccount.id,
            role: rawRole,
            cupId: req.body.cupId || null,
            assignedBy: req.user.id,
            expiresAt
          });
          return res.status(201).json({ role: formatRoleAssignment(assignment) });
        }

        const lowerUsername = username.toLowerCase();
        let invite;
        if (req.body.cupId) {
          invite = await channelManager.prisma.channelRoleInvite.upsert({
            where: {
              channelId_invitedUsername_role_cupId: {
                channelId: normalizedChannelId,
                invitedUsername: lowerUsername,
                role: rawRole,
                cupId: req.body.cupId
              }
            },
            update: {
              assignedBy: req.user.id,
              note: req.body.note || undefined,
              expiresAt
            },
            create: {
              channelId: normalizedChannelId,
              invitedUsername: lowerUsername,
              role: rawRole,
              cupId: req.body.cupId,
              note: req.body.note || undefined,
              assignedBy: req.user.id,
              expiresAt
            },
            include: {
              assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
              cup: { select: { id: true, title: true, slug: true, status: true } }
            }
          });
        } else {
          const existing = await channelManager.prisma.channelRoleInvite.findFirst({
            where: {
              channelId: normalizedChannelId,
              invitedUsername: lowerUsername,
              role: rawRole,
              cupId: null
            },
            include: {
              assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
              cup: { select: { id: true, title: true, slug: true, status: true } }
            }
          });
          if (existing) {
            invite = await channelManager.prisma.channelRoleInvite.update({
              where: { id: existing.id },
              data: {
                assignedBy: req.user.id,
                note: req.body.note || undefined,
                expiresAt
              },
              include: {
                assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                cup: { select: { id: true, title: true, slug: true, status: true } }
              }
            });
          } else {
            invite = await channelManager.prisma.channelRoleInvite.create({
              data: {
                channelId: normalizedChannelId,
                invitedUsername: lowerUsername,
                role: rawRole,
                cupId: null,
                note: req.body.note || undefined,
                assignedBy: req.user.id,
                expiresAt
              },
              include: {
                assignedByAccount: { select: { id: true, username: true, displayName: true, profileImageUrl: true } },
                cup: { select: { id: true, title: true, slug: true, status: true } }
              }
            });
          }
        }

        return res.status(201).json({ invite: formatRoleInvite(invite) });
      } catch (error) {
        logger.error('Error creating role invite:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to create role invite' });
      }
    }
  );

  router.delete('/channels/:channelId/role-invites/:inviteId',
    requireAuth,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const normalizedChannelId = await ensureOwnerOrManager(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const inviteId = parseInt(req.params.inviteId, 10);
        if (!Number.isInteger(inviteId)) {
          return res.status(400).json({ error: 'Invalid invite ID' });
        }

        const invite = await channelManager.prisma.channelRoleInvite.findUnique({ where: { id: inviteId } });
        if (!invite || invite.channelId !== normalizedChannelId) {
          return res.status(404).json({ error: 'Role invite not found' });
        }

        await channelManager.prisma.channelRoleInvite.delete({ where: { id: inviteId } });
        return res.json({ success: true });
      } catch (error) {
        logger.error('Error removing role invite:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to remove role invite' });
      }
    }
  );

  router.delete('/channels/:channelId/roles/:assignmentId',
    requireAuth,
    async (req, res) => {
      try {
        const channelManager = getChannelManager(req);
        const roleService = req.app.get('roleService');
        if (!roleService) {
          return res.status(500).json({ error: 'Role service not available' });
        }

        const normalizedChannelId = await ensureOwnerOrManager(
          channelManager,
          req.user.id,
          req.params.channelId
        );

        const assignmentId = parseInt(req.params.assignmentId, 10);
        if (!Number.isInteger(assignmentId)) {
          return res.status(400).json({ error: 'Invalid assignment ID' });
        }

        const assignment = await channelManager.prisma.channelRoleAssignment.findUnique({
          where: { id: assignmentId }
        });

        if (!assignment || assignment.channelId !== normalizedChannelId) {
          return res.status(404).json({ error: 'Role assignment not found' });
        }

        await roleService.revokeChannelRole({
          channelId: normalizedChannelId,
          accountId: assignment.accountId,
          role: assignment.role,
          cupId: assignment.cupId
        });

        res.json({ success: true });
      } catch (error) {
        logger.error('Error removing channel role:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to remove channel role' });
      }
    }
  );
};
