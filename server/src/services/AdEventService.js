const axios = require('axios');
const WebSocket = require('ws');
const logger = require('../utils/logger');
const TokenStore = require('./TokenStore');

// Minimal EventSub over WebSocket + Ads Schedule poller
// Notes:
// - Requires Twitch app credentials in env: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
// - Requires per-broadcaster user access tokens with ad scopes.
//   Provide via env JSON mapping TWITCH_ADS_CREDENTIALS, e.g.:
//   { "123456789": { "access_token": "...", "refresh_token": "..." } }
//   where keys are broadcaster_user_id (numeric). Refresh logic is not implemented.
// - If no credentials are present, the service remains disabled.

class AdEventService {
  constructor(channelManager, bot) {
    this.channelManager = channelManager;
    this.bot = bot;
    this.enabled = false;
    this.clientId = process.env.TWITCH_CLIENT_ID || null;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || null;
    this.credentials = {}; // No env fallbacks; credentials provided via TokenStore
    this.ws = null;
    this.sessionId = null;
    this.keepaliveTimeout = null;
    this.pollIntervals = new Map(); // broadcaster_user_id -> timer
    this.warnTimers = new Map(); // channelId -> timer for 30s pre-ad
    this.endTimers = new Map(); // channelId -> timer for end-of-ad
  }

  _loadCredentials() { return {}; }

  isConfigured() {
    // Allow initialization even if we don't yet have user tokens; they may arrive after login
    return Boolean(this.clientId && this.clientSecret);
  }

  async initialize() {
    if (!this.isConfigured()) {
      logger.info('AdEventService disabled (missing credentials)');
      return;
    }

    this.enabled = true;
    await this._connectWebSocket();

    // Start ad schedule polling as a best-effort for 30s pre-warn
    this._startSchedulePolling();
  }

  async shutdown() {
    this.enabled = false;
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    if (this.keepaliveTimeout) clearTimeout(this.keepaliveTimeout);
    for (const t of this.pollIntervals.values()) clearInterval(t);
    for (const t of this.warnTimers.values()) clearTimeout(t);
    for (const t of this.endTimers.values()) clearTimeout(t);
    this.pollIntervals.clear();
    this.warnTimers.clear();
    this.endTimers.clear();
  }

  async _connectWebSocket() {
    try {
      const url = 'wss://eventsub.wss.twitch.tv/ws';
      this.ws = new WebSocket(url);
      logger.info('AdEventService: connecting to EventSub WebSocket');

      this.ws.on('open', () => {
        logger.info('AdEventService: EventSub WebSocket open');
      });

      this.ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const type = msg?.metadata?.message_type || msg?.metadata?.messageType || msg?.metadata?.message_type;
          if (type === 'session_welcome') {
            this.sessionId = msg?.payload?.session?.id;
            logger.info('AdEventService: session established', { sessionId: this.sessionId });
            await this._subscribeToAdBreaks();
            this._armKeepalive(msg?.payload?.session?.keepalive_timeout_seconds || 10);
          } else if (type === 'session_keepalive') {
            this._armKeepalive(msg?.payload?.session?.keepalive_timeout_seconds || 10);
          } else if (type === 'session_reconnect') {
            const reconnectUrl = msg?.payload?.session?.reconnect_url;
            logger.info('AdEventService: reconnect requested', { reconnectUrl });
            await this._reconnect(reconnectUrl);
          } else if (type === 'notification') {
            const subType = msg?.payload?.subscription?.type;
            if (subType === 'channel.ad_break.begin') {
              await this._handleAdBreakBegin(msg?.payload?.event);
            }
          } else if (type === 'revocation') {
            logger.warn('AdEventService: subscription revoked', { sub: msg?.payload?.subscription });
          }
        } catch (err) {
          logger.warn('AdEventService: failed to process EventSub message', { err: err?.message });
        }
      });

      this.ws.on('close', (code, reason) => {
        logger.warn('AdEventService: EventSub WebSocket closed', { code, reason: reason?.toString?.() });
        this.sessionId = null;
        if (this.enabled) {
          setTimeout(() => this._connectWebSocket(), 2000);
        }
      });

      this.ws.on('error', (err) => {
        logger.error('AdEventService: WebSocket error', { error: err?.message });
      });
    } catch (err) {
      logger.error('AdEventService: failed to connect EventSub WebSocket', { error: err?.message });
    }
  }

  _armKeepalive(timeoutSec) {
    if (this.keepaliveTimeout) clearTimeout(this.keepaliveTimeout);
    const ms = Math.max(5, Number(timeoutSec || 10) - 1) * 1000;
    this.keepaliveTimeout = setTimeout(() => {
      try { logger.warn('AdEventService: keepalive timeout; reconnecting'); } catch (_) {}
      if (this.ws) try { this.ws.terminate(); } catch (_) {}
    }, ms);
  }

  async _reconnect(url) {
    try {
      if (this.ws) try { this.ws.close(); } catch (_) {}
      this.ws = new WebSocket(url);
    } catch (err) {
      logger.error('AdEventService: reconnect failed', { error: err?.message });
    }
  }

  _getAllCredentials() {
    // Only use tokens captured from logged-in users via TokenStore
    return TokenStore.listBroadcasterCredentials();
  }

  async _subscribeToAdBreaks() {
    if (!this.sessionId) return;
    const entries = this._getAllCredentials();
    if (!entries.length) return;

    for (const [broadcasterId, cred] of entries) {
      try {
        await this._createSubscription('channel.ad_break.begin', '1', { broadcaster_user_id: String(broadcasterId) }, cred.access_token);
        logger.info('AdEventService: subscribed to ad breaks', { broadcasterId });
      } catch (err) {
        logger.warn('AdEventService: subscription failed', { broadcasterId, error: err?.message });
      }
    }
  }

  async _createSubscription(type, version, condition, userAccessToken) {
    const token = userAccessToken; // For channel.* events, user token is typically required.
    const resp = await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type,
      version,
      condition,
      transport: {
        method: 'websocket',
        session_id: this.sessionId
      }
    }, {
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return resp?.data;
  }

  _resolveChannelNameByBroadcasterId(broadcasterId) {
    const channels = this.channelManager.getAllChannels();
    for (const channelId of channels) {
      const info = this.channelManager.getChannelInfo ? null : null;
      // ChannelManager doesn’t expose a direct getter for Channel record here.
      // Use the Prisma client to lookup by twitchUserId.
    }
    return null;
  }

  async _handleAdBreakBegin(event) {
    try {
      const broadcasterId = String(event?.broadcaster_user_id || event?.broadcaster_user_id);
      const durationSec = Number(event?.duration_seconds || event?.duration || 0);

      // Map broadcasterId to our channelId (name) via Prisma
      let channelId = null;
      try {
        const prisma = this.channelManager.prisma;
        const chan = await prisma.channel.findFirst({ where: { twitchUserId: broadcasterId } });
        channelId = chan?.id || null;
      } catch (_) {}
      if (!channelId) {
        logger.warn('AdEventService: unknown broadcaster id for ad event', { broadcasterId });
        return;
      }
      const chatChannel = `#${channelId}`;

      // Cancel any pre-warn timer; announce start now and schedule end
      const wKey = channelId;
      const eKey = channelId;
      if (this.warnTimers.has(wKey)) {
        clearTimeout(this.warnTimers.get(wKey));
        this.warnTimers.delete(wKey);
      }

      const { enabled, startMsg, endMsg } = await this._getAdSettings(channelId);
      if (!enabled) return;
      this._sendMessage(chatChannel, startMsg);

      if (Number.isFinite(durationSec) && durationSec > 0) {
        if (this.endTimers.has(eKey)) clearTimeout(this.endTimers.get(eKey));
        const timer = setTimeout(async () => {
          try {
            const { enabled: en2, endMsg: em2 } = await this._getAdSettings(channelId);
            if (en2) this._sendMessage(chatChannel, em2);
          } finally {
            this.endTimers.delete(eKey);
          }
        }, durationSec * 1000);
        this.endTimers.set(eKey, timer);
      }
    } catch (err) {
      logger.warn('AdEventService: failed to handle ad begin', { err: err?.message });
    }
  }

  _sendMessage(channel, text) {
    try {
      if (this.bot?.isConnected?.()) {
        this.bot.sendMessage(channel, text);
      }
    } catch (_) {}
  }

  _startSchedulePolling() {
    const entries = this._getAllCredentials();
    for (const [broadcasterId, cred] of entries) {
      if (this.pollIntervals.has(broadcasterId)) continue;
      const poll = async () => {
        try {
          const data = await this._getAdSchedule(broadcasterId, cred.access_token);
          const nextAtIso = data?.data?.[0]?.next_ad_at || data?.data?.[0]?.next_ad_time;
          const durationSec = Number(data?.data?.[0]?.duration_seconds || 0);
          if (!nextAtIso) return;

          const nextAt = new Date(nextAtIso).getTime();
          const now = Date.now();
          const warnAt = nextAt - 30_000;
          if (warnAt <= now) return; // too late

          // Resolve channel name by broadcaster id
          let channelId = null;
          try {
            const prisma = this.channelManager.prisma;
            const chan = await prisma.channel.findFirst({ where: { twitchUserId: String(broadcasterId) } });
            channelId = chan?.id || null;
          } catch (_) {}
          if (!channelId) return;

          const key = channelId;
          if (this.warnTimers.has(key)) {
            // If an existing timer is scheduled for a different time, reset it
            clearTimeout(this.warnTimers.get(key));
            this.warnTimers.delete(key);
          }

          const timeoutMs = warnAt - now;
          if (timeoutMs > 0 && timeoutMs < 60 * 60 * 1000) {
            const chatChannel = `#${channelId}`;
            const timer = setTimeout(async () => {
              try {
                const { enabled, warnMsg, endMsg } = await this._getAdSettings(channelId);
                if (enabled) {
                  this._sendMessage(chatChannel, warnMsg);
                  // Also schedule end message as a fallback if EventSub notification is missed
                  if (Number.isFinite(durationSec) && durationSec > 0) {
                    const endKey = channelId;
                    if (this.endTimers.has(endKey)) clearTimeout(this.endTimers.get(endKey));
                    const endDelay = 30_000 + (durationSec * 1000);
                    const endTimer = setTimeout(async () => {
                      try {
                        const { enabled: en3, endMsg: em3 } = await this._getAdSettings(channelId);
                        if (en3) this._sendMessage(chatChannel, em3);
                      } finally {
                        this.endTimers.delete(endKey);
                      }
                    }, endDelay);
                    this.endTimers.set(endKey, endTimer);
                  }
                }
              } finally {
                this.warnTimers.delete(key);
              }
            }, timeoutMs);
            this.warnTimers.set(key, timer);
          }
        } catch (err) {
          logger.debug?.('AdEventService: ad schedule poll failed', { err: err?.message });
        }
      };

      // Kick off now, then every 60s
      poll();
      this.pollIntervals.set(broadcasterId, setInterval(poll, 60 * 1000));
    }
  }

  async refreshSubscriptions() {
    try {
      // Try to subscribe for any new broadcasters (won't duplicate existing subs server-side)
      await this._subscribeToAdBreaks();
      // Start polling timers for any new broadcasters
      this._startSchedulePolling();
    } catch (err) {
      logger.warn('AdEventService: refreshSubscriptions failed', { error: err?.message });
    }
  }

  async _getAdSchedule(broadcasterId, userAccessToken) {
    const url = `https://api.twitch.tv/helix/channels/ads?broadcaster_id=${encodeURIComponent(broadcasterId)}`;
    const resp = await axios.get(url, {
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${userAccessToken}`
      }
    });
    return resp?.data || null;
  }

  async _getAdSettings(channelId) {
    try {
      const info = await this.channelManager.getChannelInfo(channelId);
      const settings = info?.settings || {};
      const enabled = String(settings.ad_announcements_enabled ?? 'true') === 'true';
      const warnMsg = settings.ad_warn_message || 'Heads up: ads will run in 30 seconds. BRB!';
      const startMsg = settings.ad_start_message || 'Ad break starting now — see you after the ads!';
      const endMsg = settings.ad_end_message || 'Ads are over — welcome back!';
      return { enabled, warnMsg, startMsg, endMsg };
    } catch (_) {
      return {
        enabled: true,
        warnMsg: 'Heads up: ads will run in 30 seconds. BRB!',
        startMsg: 'Ad break starting now — see you after the ads!',
        endMsg: 'Ads are over — welcome back!'
      };
    }
  }
}

module.exports = AdEventService;
