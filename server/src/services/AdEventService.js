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
    this.appToken = null;
    this.appTokenExpiresAt = 0;
    this.liveCache = new Map(); // broadcasterId -> { live: boolean, ts: number }
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
    await this._primeFromDatabase();
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
          // Any message indicates liveness; re-arm keepalive with a friendly buffer
          this._armKeepalive((msg?.payload?.session?.keepalive_timeout_seconds) || 10);
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
    // Give a generous buffer beyond Twitch's advertised timeout to avoid flapping
    const base = Number(timeoutSec || 10);
    const sec = (Number.isFinite(base) ? base : 10) + 5; // +5s cushion
    const ms = Math.max(5000, sec * 1000);
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

  async _primeFromDatabase() {
    try {
      const prisma = this.channelManager.prisma;
      const accounts = await prisma.account.findMany({
        where: { twitchId: { not: null }, twitchAccessToken: { not: null } },
        select: { id: true, twitchId: true, twitchAccessToken: true, twitchRefreshToken: true, twitchTokenScope: true }
      });
      for (const acc of accounts) {
        TokenStore.setToken({
          accountId: acc.id,
          twitchUserId: acc.twitchId,
          accessToken: acc.twitchAccessToken,
          refreshToken: acc.twitchRefreshToken || null,
          scopes: (acc.twitchTokenScope || '').split(/\s+/).filter(Boolean)
        });
      }
      logger.info(`AdEventService: primed ${accounts.length} broadcaster token(s) from DB`);
    } catch (err) {
      logger.warn('AdEventService: failed to prime tokens from DB', { error: err?.message });
    }
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
        const status = err?.response?.status;
        const data = err?.response?.data;
        logger.warn('AdEventService: subscription failed', { broadcasterId, error: err?.message, status, data });
        if (status === 400) {
          logger.warn('AdEventService: tip — broadcaster likely needs to re-login so we can capture a token with channel:read:ads scope');
        } else if (status === 403) {
          logger.warn('AdEventService: tip — token may not belong to the specified broadcaster');
        }
      }
    }
  }

  async _createSubscription(type, version, condition, userAccessToken) {
    const token = userAccessToken; // For channel.* events, user token is typically required.
    const makeReq = async (bearer) => axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
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
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json'
      }
    });
    let resp;
    try {
      resp = await makeReq(token);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401 || status === 400) {
        const refreshed = await this._refreshTokenFor(condition.broadcaster_user_id);
        if (refreshed) {
          resp = await makeReq(refreshed);
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    return resp?.data;
  }

  // removed unused helper: broadcaster id → channel id

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

      const { enabled, startMsg } = await this._getAdSettings(channelId);
      if (!enabled) return;
      this._sendMessage(chatChannel, this._formatMsg(startMsg, { durationSec }));

      if (Number.isFinite(durationSec) && durationSec > 0) {
        if (this.endTimers.has(eKey)) clearTimeout(this.endTimers.get(eKey));
        const timer = setTimeout(async () => {
          try {
            const { enabled: en2, endMsg: em2 } = await this._getAdSettings(channelId);
            if (en2) this._sendMessage(chatChannel, this._formatMsg(em2, { durationSec }));
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
          // Skip work if the channel is not live (checked via app token)
          const live = await this._isLive(String(broadcasterId));
          if (!live) {
            // Clear any pending warn timers if the channel went offline
            try {
              const prisma = this.channelManager.prisma;
              const chan = await prisma.channel.findFirst({ where: { twitchUserId: String(broadcasterId) } });
              const channelId = chan?.id || null;
              if (channelId && this.warnTimers.has(channelId)) {
                clearTimeout(this.warnTimers.get(channelId));
                this.warnTimers.delete(channelId);
              }
            } catch (_) {}
            return;
          }

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
                const { enabled, warnMsg } = await this._getAdSettings(channelId);
                if (enabled) {
                  this._sendMessage(chatChannel, this._formatMsg(warnMsg, { durationSec }));
                  // Also schedule end message as a fallback if EventSub notification is missed
                  if (Number.isFinite(durationSec) && durationSec > 0) {
                    const endKey = channelId;
                    if (this.endTimers.has(endKey)) clearTimeout(this.endTimers.get(endKey));
                    const endDelay = 30_000 + (durationSec * 1000);
                    const endTimer = setTimeout(async () => {
                      try {
                        const { enabled: en3, endMsg: em3 } = await this._getAdSettings(channelId);
                        if (en3) this._sendMessage(chatChannel, this._formatMsg(em3, { durationSec }));
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
    // Optional guard: avoid Helix call if offline
    const live = await this._isLive(String(broadcasterId));
    if (!live) return null;
    const url = `https://api.twitch.tv/helix/channels/ads?broadcaster_id=${encodeURIComponent(broadcasterId)}`;
    const makeReq = async (bearer) => axios.get(url, {
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${bearer}`
      }
    });
    try {
      const resp = await makeReq(userAccessToken);
      return resp?.data || null;
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401 || status === 400) {
        const refreshed = await this._refreshTokenFor(String(broadcasterId));
        if (refreshed) {
          const resp2 = await makeReq(refreshed);
          return resp2?.data || null;
        }
      }
      throw e;
    }
  }

  async getNextAdForChannel(channelId) {
    try {
      const prisma = this.channelManager.prisma;
      const chan = await prisma.channel.findUnique({ where: { id: String(channelId).toLowerCase() }, select: { twitchUserId: true } });
      const broadcasterId = chan?.twitchUserId ? String(chan.twitchUserId) : null;
      if (!broadcasterId) {
        return { live: false, nextAdAt: null, duration: null };
      }
      const live = await this._isLive(broadcasterId);
      if (!live) {
        return { live: false, nextAdAt: null, duration: null };
      }
      const rec = TokenStore.getByTwitchUserId(broadcasterId);
      const bearer = rec?.accessToken || null;
      const data = await this._getAdSchedule(broadcasterId, bearer);
      const entry = Array.isArray(data?.data) ? data.data[0] : null;
      const nextAdAt = entry?.next_ad_at || entry?.next_ad_time || null;
      const duration = typeof entry?.duration_seconds === 'number' ? entry.duration_seconds : null;
      return { live: true, nextAdAt, duration };
    } catch (err) {
      logger.warn('AdEventService: getNextAdForChannel failed', { channelId, error: err?.message, data: err?.response?.data });
      return { live: null, nextAdAt: null, duration: null };
    }
  }

  async _getAppAccessToken() {
    const now = Date.now();
    if (this.appToken && now < this.appTokenExpiresAt - 10_000) {
      return this.appToken;
    }
    const params = new URLSearchParams();
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('grant_type', 'client_credentials');
    const resp = await axios.post('https://id.twitch.tv/oauth2/token', params);
    const body = resp?.data || {};
    this.appToken = body.access_token;
    const expiresIn = Number(body.expires_in || 0);
    this.appTokenExpiresAt = expiresIn > 0 ? now + expiresIn * 1000 : now + 3600 * 1000;
    return this.appToken;
  }

  async _isLive(broadcasterId) {
    try {
      const cached = this.liveCache.get(broadcasterId);
      const now = Date.now();
      if (cached && (now - cached.ts) < 60_000) {
        return cached.live;
      }
      const token = await this._getAppAccessToken();
      const resp = await axios.get(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(broadcasterId)}`, {
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${token}`
        }
      });
      const arr = Array.isArray(resp?.data?.data) ? resp.data.data : [];
      const live = arr.length > 0 && String(arr[0]?.type || '').toLowerCase() === 'live';
      this.liveCache.set(broadcasterId, { live, ts: now });
      return live;
    } catch (err) {
      logger.debug?.('AdEventService: _isLive check failed', { broadcasterId, error: err?.message });
      // If rate-limited or failed, default to true to avoid missing schedules while live
      const fallback = true;
      this.liveCache.set(broadcasterId, { live: fallback, ts: Date.now() });
      return fallback;
    }
  }

  async _refreshTokenFor(broadcasterId) {
    try {
      const prisma = this.channelManager.prisma;
      const account = await prisma.account.findFirst({ where: { twitchId: String(broadcasterId) } });
      if (!account?.twitchRefreshToken) {
        logger.warn('AdEventService: no refresh token for broadcaster', { broadcasterId });
        return null;
      }
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', account.twitchRefreshToken);
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      const resp = await axios.post('https://id.twitch.tv/oauth2/token', params);
      const body = resp?.data || {};
      const newAccess = body.access_token;
      const newRefresh = body.refresh_token || account.twitchRefreshToken;
      const expiresIn = Number(body.expires_in || 0);
      const scopesArr = Array.isArray(body.scope) ? body.scope : (account.twitchTokenScope ? account.twitchTokenScope.split(/\s+/) : []);
      const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

      await prisma.account.update({
        where: { id: account.id },
        data: {
          twitchAccessToken: newAccess,
          twitchRefreshToken: newRefresh,
          twitchTokenScope: scopesArr.join(' '),
          twitchTokenExpiresAt: expiresAt
        }
      });

      // Update in-memory token
      TokenStore.setToken({
        accountId: account.id,
        twitchUserId: broadcasterId,
        accessToken: newAccess,
        refreshToken: newRefresh,
        scopes: scopesArr
      });

      logger.info('AdEventService: refreshed broadcaster token', { broadcasterId });
      return newAccess;
    } catch (err) {
      logger.warn('AdEventService: token refresh failed', { broadcasterId, error: err?.message, data: err?.response?.data });
      return null;
    }
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

  _formatMsg(template, { durationSec = null } = {}) {
    try {
      let msg = String(template || '');
      if (typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0) {
        const m = Math.floor(durationSec / 60);
        const s = Math.floor(durationSec % 60);
        const mmss = `${m}:${s.toString().padStart(2, '0')}`;
        const human = m > 0 ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
        msg = msg
          .replaceAll('{duration}', String(durationSec))
          .replaceAll('{duration_sec}', String(durationSec))
          .replaceAll('{duration_min}', String(m))
          .replaceAll('{duration_mmss}', mmss)
          .replaceAll('{duration_human}', human);
      }
      return msg;
    } catch (_) {
      return template || '';
    }
  }
}

module.exports = AdEventService;
