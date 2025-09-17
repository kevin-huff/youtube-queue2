const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

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

    const channelId = username;

    // Ensure the channel exists and is up to date
    let channel = await prisma.channel.findUnique({ where: { id: channelId } });

    if (!channel) {
      channel = await prisma.channel.create({
        data: {
          id: channelId,
          twitchUserId,
          displayName,
          profileImageUrl,
          isActive: true,
          settings: {
            queue_enabled: false,
            max_queue_size: 50,
            submission_cooldown: 30,
            max_video_duration: 600,
            auto_play_next: true,
            current_volume: 75
          }
        }
      });

      logger.info(`Created new channel: ${channelId}`);
    } else {
      channel = await prisma.channel.update({
        where: { id: channelId },
        data: {
          twitchUserId,
          displayName,
          profileImageUrl
        }
      });
    }

    // Ensure ownership link exists
    await prisma.channelOwner.upsert({
      where: {
        accountId_channelId: {
          accountId: account.id,
          channelId: channel.id
        }
      },
      update: {
        role: 'OWNER'
      },
      create: {
        accountId: account.id,
        channelId: channel.id,
        role: 'OWNER'
      }
    });

    const ownedChannels = await prisma.channelOwner.findMany({
      where: { accountId: account.id },
      include: {
        channel: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const userData = {
      id: account.id,
      username: account.username,
      displayName: account.displayName || account.username,
      profileImageUrl: account.profileImageUrl,
      email: account.email,
      channels: ownedChannels.map(({ channel, role }) => ({
        id: channel.id,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
        isActive: channel.isActive,
        role
      }))
    };

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
passport.deserializeUser(async (channelId, done) => {
  try {
    const account = await prisma.account.findUnique({
      where: { id: channelId },
      include: {
        channels: {
          include: {
            channel: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!account) {
      return done(null, false);
    }

    const userData = {
      id: account.id,
      username: account.username,
      displayName: account.displayName || account.username,
      profileImageUrl: account.profileImageUrl,
      email: account.email,
      channels: account.channels.map(({ channel, role }) => ({
        id: channel.id,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
        isActive: channel.isActive,
        role
      }))
    };

    done(null, userData);
  } catch (error) {
    logger.error('Error deserializing user:', error);
    done(error, null);
  }
});

module.exports = passport;
