const passport = require('passport');
const logger = require('../utils/logger');

module.exports = (router, { helpers: _helpers }) => {
  // OAuth routes (conditionally enabled)
  const TWITCH_AUTH_ENABLED = Boolean(
    process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET && process.env.TWITCH_REDIRECT_URI
  );

  if (TWITCH_AUTH_ENABLED) {
    router.get('/auth/twitch',
      passport.authenticate('twitch', {
        scope: [
          'user:read:email',
          'channel:read:subscriptions',
          // Needed for ad schedule + EventSub ad break subscriptions
          'channel:read:ads'
          // Optionally: 'channel:manage:ads' if you want to trigger commercials
        ]
      })
    );

    router.get('/auth/twitch/callback',
      passport.authenticate('twitch', { failureRedirect: '/login?error=auth_failed' }),
      async (req, res) => {
      try {
        const channelManager = req.app.get('channelManager');
        const bot = req.app.get('bot');
        const adService = req.app.get('adEventService');

        if (channelManager && req.user?.channels?.length) {
          for (const channel of req.user.channels) {
            const channelId = channel.id.toLowerCase();

            if (!channelManager.getChannelInstance(channelId)) {
              await channelManager.createChannelInstance(channelId);
            } else if (!channelManager.isChannelActive(channelId)) {
              await channelManager.activateChannel(channelId);
            }

            if (bot?.isConnected?.()) {
              await bot.joinChannel(channelId);
            }
          }
        }

        // Hint ad service to refresh subscriptions/polling now that we may have tokens
        try { if (adService?.refreshSubscriptions) await adService.refreshSubscriptions(); } catch (err) { logger.warn('Failed to refresh ad subscriptions after auth', { error: err?.message }); }
      } catch (error) {
        logger.error('Post-auth channel initialization failed:', error);
      }

      const redirectUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
      const hasAnyChannel = Array.isArray(req.user?.channels) && req.user.channels.length > 0;
      const targetPath = hasAnyChannel ? '/dashboard' : '/onboarding';
      res.redirect(`${redirectUrl}${targetPath}`);
      }
    );
  } else {
    router.get('/auth/twitch', (req, res) => {
      res.status(503).json({ error: 'Twitch OAuth is not configured on this deployment' });
    });
    router.get('/auth/twitch/callback', (req, res) => {
      res.redirect('/login?error=oauth_not_configured');
    });
  }

  router.get('/auth/user', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json({
        authenticated: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          displayName: req.user.displayName,
          email: req.user.email,
          profileImageUrl: req.user.profileImageUrl,
          channels: req.user.channels || []
        }
      });
    }

    return res.json({ authenticated: false });
  });

  router.post('/auth/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        logger.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      return res.json({ success: true });
    });
  });
};
