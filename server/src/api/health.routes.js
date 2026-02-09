const logger = require('../utils/logger');
const { requireAuth } = require('../auth/middleware');

module.exports = (router, { helpers }) => {
  const { getChannelManager } = helpers;

  router.get('/stats/global', requireAuth, async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const videoService = req.app.get('videoService');
      const bot = req.app.get('bot');

      const globalStats = await channelManager.getGlobalStats();
      const cacheStats = videoService ? videoService.getCacheStats() : null;
      const botStats = bot ? bot.getStats() : null;

      res.json({
        global: globalStats,
        cache: cacheStats,
        bot: botStats,
        uptime: process.uptime(),
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error getting global stats:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to get statistics' });
    }
  });

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });
};
