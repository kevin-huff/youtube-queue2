const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

module.exports = (router, { helpers }) => {
  const { getChannelManager, requireAdmin, ADMIN_TWITCH_IDS } = helpers;

  // Admin: system/debug info (admin-only)
  router.get('/admin/debug/info', requireAdmin, async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const prisma = channelManager.prisma;
      const account = await prisma.account.findUnique({ where: { id: req.user.id }, select: { id: true, username: true, twitchId: true, displayName: true } });
      const adService = req.app.get('adEventService');
      const adStatus = adService ? {
        enabled: !!adService.enabled,
        sessionId: adService.sessionId || null,
        pollers: adService.pollIntervals ? adService.pollIntervals.size : 0
      } : null;
      const activeChannels = channelManager.getActiveChannels();
      const totalChannels = await prisma.channel.count();
      const adminIds = ADMIN_TWITCH_IDS;
      res.json({
        admin: true,
        adminIds,
        user: {
          id: account?.id || null,
          username: account?.username || null,
          displayName: account?.displayName || null,
          twitchId: account?.twitchId || null
        },
        adService: adStatus,
        channels: {
          active: activeChannels,
          total: totalChannels
        }
      });
    } catch (err) {
      logger.error('admin/debug/info failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to load debug info' });
    }
  });

  // Admin: list channels (id, displayName, twitchUserId, isActive)
  router.get('/admin/channels', requireAdmin, async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const rows = await channelManager.prisma.channel.findMany({
        select: { id: true, displayName: true, twitchUserId: true, isActive: true }
      });
      res.json({ channels: rows });
    } catch (err) {
      logger.error('admin/channels failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to list channels' });
    }
  });

  // Admin: ads next for any channel (no ownership required)
  router.get('/admin/debug/ads/next', requireAdmin, async (req, res) => {
    try {
      const channelId = String(req.query.channelId || '').toLowerCase();
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      const adService = req.app.get('adEventService');
      if (!adService || !adService.enabled) {
        return res.status(503).json({ error: 'Ad service unavailable' });
      }
      const result = await adService.getNextAdForChannel(channelId);
      res.json({ channelId, ...result });
    } catch (err) {
      logger.error('admin/debug/ads/next failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to load next ad' });
    }
  });

  // Admin: tail logs (app|error|exceptions)
  router.get('/admin/logs', requireAdmin, async (req, res) => {
    try {
      const which = String(req.query.file || 'app');
      const linesReq = Number(req.query.lines || 200);
      const lines = Number.isFinite(linesReq) ? Math.max(1, Math.min(2000, Math.floor(linesReq))) : 200;
      const nameMap = { app: 'app.log', error: 'error.log', exceptions: 'exceptions.log' };
      const fname = nameMap[which] || nameMap.app;
      const p = path.join(process.cwd(), 'logs', fname);
      if (!fs.existsSync(p)) {
        return res.json({ file: fname, lines: [], note: 'log file not found' });
      }
      const data = fs.readFileSync(p, 'utf8');
      const arr = data.split(/\r?\n/);
      const slice = arr.slice(-lines).filter((l) => l && l.trim().length > 0);
      res.json({ file: fname, lines: slice });
    } catch (err) {
      logger.error('admin/logs failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to read logs' });
    }
  });

  // Admin: set log level at runtime (e.g., debug, info, warn, error)
  router.post('/admin/log-level', requireAdmin, async (req, res) => {
    try {
      const { level } = req.body || {};
      const allowed = new Set(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']);
      if (!level || !allowed.has(String(level))) {
        return res.status(400).json({ error: 'Invalid level' });
      }
      logger.level = String(level);
      logger.info('Log level changed by admin', { level: logger.level });
      res.json({ ok: true, level: logger.level });
    } catch (err) {
      logger.error('admin/log-level failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to change log level' });
    }
  });

  // Admin: ad service state
  router.get('/admin/ad-service/state', requireAdmin, async (req, res) => {
    try {
      const ad = req.app.get('adEventService');
      if (!ad) return res.json({ enabled: false });
      const toArray = (m) => (m && typeof m.size === 'number' ? Array.from(m.keys ? m.keys() : []) : []);
      const pollers = toArray(ad.pollIntervals);
      const warn = toArray(ad.warnTimers);
      const end = toArray(ad.endTimers);
      const liveCache = ad.liveCache && typeof ad.liveCache.size === 'number' ? Array.from(ad.liveCache.entries()) : [];
      const broadcasters = (() => {
        try { return (ad._getAllCredentials && ad._getAllCredentials()) ? ad._getAllCredentials().map(([id]) => String(id)) : []; } catch (err) { logger.warn('Failed to retrieve broadcaster credentials', { error: err?.message }); return []; }
      })();
      res.json({
        enabled: !!ad.enabled,
        sessionId: ad.sessionId || null,
        broadcasters,
        pollers,
        warnTimers: warn,
        endTimers: end,
        liveCache: liveCache.map(([id, v]) => ({ id, live: !!v?.live, ts: v?.ts || null }))
      });
    } catch (err) {
      logger.error('admin/ad-service/state failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to get ad service state' });
    }
  });

  router.post('/admin/ad-service/refresh', requireAdmin, async (req, res) => {
    try {
      const ad = req.app.get('adEventService');
      if (!ad || !ad.enabled) return res.status(503).json({ error: 'Ad service unavailable' });
      if (ad.refreshSubscriptions) await ad.refreshSubscriptions();
      res.json({ ok: true });
    } catch (err) {
      logger.error('admin/ad-service/refresh failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to refresh subscriptions' });
    }
  });

  // Admin: list EventSub sessions (per-broadcaster)
  router.get('/admin/ad-service/sessions', requireAdmin, async (req, res) => {
    try {
      const ad = req.app.get('adEventService');
      if (!ad) return res.json({ sessions: [] });
      const sessions = ad.listSessions ? ad.listSessions() : [];
      res.json({ sessions });
    } catch (err) {
      logger.error('admin/ad-service/sessions failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  router.post('/admin/ad-service/sessions/reconnect', requireAdmin, async (req, res) => {
    try {
      const { broadcasterId } = req.body || {};
      if (!broadcasterId) return res.status(400).json({ error: 'broadcasterId required' });
      const ad = req.app.get('adEventService');
      if (!ad || !ad.enabled) return res.status(503).json({ error: 'Ad service unavailable' });
      const ok = await ad.reconnectSessionFor(String(broadcasterId));
      res.json({ ok });
    } catch (err) {
      logger.error('admin/ad-service/sessions/reconnect failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to reconnect session' });
    }
  });

  // Admin: bot controls
  router.get('/admin/bot', requireAdmin, async (req, res) => {
    try {
      const bot = req.app.get('bot');
      if (!bot) return res.json({ connected: false });
      const stats = bot.getStats ? bot.getStats() : {};
      res.json({ ...stats });
    } catch (err) {
      logger.error('admin/bot failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to get bot stats' });
    }
  });

  router.post('/admin/bot/join', requireAdmin, async (req, res) => {
    try {
      const { channelId } = req.body || {};
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      const bot = req.app.get('bot');
      if (!bot || !bot.isConnected()) return res.status(503).json({ error: 'Bot not connected' });
      const ok = await bot.joinChannel(String(channelId).toLowerCase());
      res.json({ ok });
    } catch (err) {
      logger.error('admin/bot/join failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to join channel' });
    }
  });

  router.post('/admin/bot/leave', requireAdmin, async (req, res) => {
    try {
      const { channelId } = req.body || {};
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      const bot = req.app.get('bot');
      if (!bot || !bot.isConnected()) return res.status(503).json({ error: 'Bot not connected' });
      const ok = await bot.leaveChannel(String(channelId).toLowerCase());
      res.json({ ok });
    } catch (err) {
      logger.error('admin/bot/leave failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to leave channel' });
    }
  });

  router.post('/admin/bot/say', requireAdmin, async (req, res) => {
    try {
      const { channelId, message } = req.body || {};
      if (!channelId || !message) return res.status(400).json({ error: 'channelId and message required' });
      const bot = req.app.get('bot');
      if (!bot || !bot.isConnected()) return res.status(503).json({ error: 'Bot not connected' });
      const text = `[ADMIN] ${String(message).slice(0, 300)}`;
      bot.sendMessage(`#${String(channelId).toLowerCase()}`, text);
      res.json({ ok: true });
    } catch (err) {
      logger.error('admin/bot/say failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Admin: channel controls
  router.get('/admin/channels/:channelId/inspect', requireAdmin, async (req, res) => {
    try {
      const channelId = String(req.params.channelId).toLowerCase();
      const channelManager = getChannelManager(req);
      const info = await channelManager.getChannelInfo(channelId);
      const instance = channelManager.getChannelInstance(channelId);
      const queueService = instance?.queueService;
      const current = queueService?.currentlyPlaying || null;
      res.json({
        info,
        currentlyPlaying: current ? {
          id: current.id,
          title: current.title,
          videoId: current.videoId,
          status: current.status,
          submitterUsername: current.submitterUsername,
          playedAt: current.playedAt || null
        } : null
      });
    } catch (err) {
      logger.error('admin/channels/inspect failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to inspect channel' });
    }
  });

  router.post('/admin/channels/:channelId/activate', requireAdmin, async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const channelId = String(req.params.channelId).toLowerCase();
      await channelManager.activateChannel(channelId);
      res.json({ ok: true });
    } catch (err) {
      logger.error('admin/channels/activate failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to activate channel' });
    }
  });

  router.post('/admin/channels/:channelId/deactivate', requireAdmin, async (req, res) => {
    try {
      const channelManager = getChannelManager(req);
      const channelId = String(req.params.channelId).toLowerCase();
      await channelManager.deactivateChannel(channelId);
      res.json({ ok: true });
    } catch (err) {
      logger.error('admin/channels/deactivate failed', { error: err?.message });
      res.status(500).json({ error: 'Failed to deactivate channel' });
    }
  });
};
