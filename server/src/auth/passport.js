const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

const buildUserPayload = async (accountId) => {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      channels: {
        include: {
          channel: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
      roleAssignments: {
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
      }
    }
  });

  if (!account) {
    return null;
  }

  const channelMap = new Map();

  const ensureChannelEntry = (channelRecord) => {
    if (!channelRecord) {
      return null;
    }

    const channelId = channelRecord.id;
    if (!channelMap.has(channelId)) {
      channelMap.set(channelId, {
        id: channelRecord.id,
        displayName: channelRecord.displayName,
        profileImageUrl: channelRecord.profileImageUrl,
        isActive: channelRecord.isActive,
        ownershipRole: null,
        roles: new Set(),
        cupRoles: new Map(),
        cups: new Map()
      });
    }
    return channelMap.get(channelId);
  };

  for (const ownership of account.channels) {
    const entry = ensureChannelEntry(ownership.channel);
    if (!entry) {
      continue;
    }

    entry.ownershipRole = ownership.role;
    if (ownership.role) {
      entry.roles.add(ownership.role);
    }
  }

  for (const assignment of account.roleAssignments || []) {
    const entry = ensureChannelEntry(assignment.channel);
    if (!entry) {
      continue;
    }

    entry.roles.add(assignment.role);

    if (assignment.cupId) {
      const rolesForCup = entry.cupRoles.get(assignment.cupId) || new Set();
      rolesForCup.add(assignment.role);
      entry.cupRoles.set(assignment.cupId, rolesForCup);

      if (assignment.cup) {
        entry.cups.set(assignment.cupId, {
          id: assignment.cup.id,
          title: assignment.cup.title,
          slug: assignment.cup.slug,
          status: assignment.cup.status,
          startsAt: assignment.cup.startsAt,
          endsAt: assignment.cup.endsAt
        });
      }
    }
  }

  const channels = Array.from(channelMap.values()).map((entry) => {
    const cupRoles = {};
    entry.cupRoles.forEach((rolesSet, cupId) => {
      cupRoles[cupId] = Array.from(rolesSet);
    });

    const cups = {};
    entry.cups.forEach((cupData, cupId) => {
      cups[cupId] = cupData;
    });

    const roles = Array.from(entry.roles);

    return {
      id: entry.id,
      displayName: entry.displayName,
      profileImageUrl: entry.profileImageUrl,
      isActive: entry.isActive,
      ownershipRole: entry.ownershipRole,
      role: entry.ownershipRole || roles[0] || null,
      roles,
      cupRoles,
      cups
    };
  });

  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName || account.username,
    profileImageUrl: account.profileImageUrl,
    email: account.email,
    channels
  };
};

// Passport configuration for Twitch OAuth
passport.use(new TwitchStrategy({
  clientID: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  callbackURL: process.env.TWITCH_REDIRECT_URI,
  scope: ['user:read:email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    logger.info(`Twitch OAuth callback for user: ${profile.login}`);
    
    const twitchUserId = profile.id;
    const username = profile.login.toLowerCase();
    const displayName = profile.display_name;
    const profileImageUrl = profile.profile_image_url;
    const email = profile.email;

    // Upsert account information
    let account = await prisma.account.findFirst({
      where: {
        OR: [
          { twitchId: twitchUserId },
          { username }
        ]
      }
    });

    if (account) {
      account = await prisma.account.update({
        where: { id: account.id },
        data: {
          twitchId: twitchUserId,
          username,
          displayName,
          profileImageUrl,
          email
        }
      });
    } else {
      account = await prisma.account.create({
        data: {
          twitchId: twitchUserId,
          username,
          displayName,
          profileImageUrl,
          email
        }
      });
    }

    // Note: Do not auto-create channels here. Ownership and channel creation
    // now occur via explicit onboarding/API actions.

    // Auto-accept any pending role invites that match this username
    try {
      const now = new Date();
      const pendingInvites = await prisma.channelRoleInvite.findMany({
        where: {
          invitedUsername: username,
          acceptedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } }
          ]
        }
      });

      for (const invite of pendingInvites) {
        try {
          // Create or update role assignment for this account
          // Ensure we don't duplicate existing assignment
          const existing = await prisma.channelRoleAssignment.findFirst({
            where: {
              channelId: invite.channelId,
              accountId: account.id,
              role: invite.role,
              cupId: invite.cupId || null
            }
          });

          if (!existing) {
            await prisma.channelRoleAssignment.create({
              data: {
                channelId: invite.channelId,
                accountId: account.id,
                role: invite.role,
                cupId: invite.cupId || null,
                assignedBy: invite.assignedBy || null,
                expiresAt: invite.expiresAt || null
              }
            });
          }

          // Mark invite as accepted
          await prisma.channelRoleInvite.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() }
          });

          try {
            logger.info('Accepted role invite on login', {
              username,
              channelId: invite.channelId,
              role: invite.role,
              cupId: invite.cupId || null
            });
          } catch (_) {}
        } catch (inviteErr) {
          logger.warn('Failed to accept role invite on login', { error: inviteErr?.message, inviteId: invite.id });
        }
      }
    } catch (invitesErr) {
      logger.warn('Error while processing role invites during OAuth callback', invitesErr);
    }

    const userData = await buildUserPayload(account.id);

    return done(null, userData);
  } catch (error) {
    logger.error('Error in Twitch OAuth strategy:', error);
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id); // Store account ID in session
});

// Deserialize user from session
passport.deserializeUser(async (accountId, done) => {
  try {
    const userData = await buildUserPayload(accountId);

    if (!userData) {
      return done(null, false);
    }

    done(null, userData);
  } catch (error) {
    logger.error('Error deserializing user:', error);
    done(error, null);
  }
});

module.exports = passport;
