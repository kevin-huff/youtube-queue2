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
    
    // Per-broadcaster EventSub sessions: broadcasterId -> session record
    this.sessions = new Map();
    
    this.pollIntervals = new Map(); // broadcaster_user_id -> timer
    this.warnTimers = new Map(); // channelId -> timer for 30s pre-ad
    this.endTimers = new Map(); // channelId -> timer for end-of-ad
    this.appToken = null;
    this.appTokenExpiresAt = 0;
    this.liveCache = new Map(); // broadcasterId -> { live: boolean, ts: number }
    // Dedup store for EventSub notifications (message_id -> ts)
    this._seenMessageIds = new Map();
    
    // Broadcasters with invalid tokens (skip reconnects until re-auth)
    this._disabledBroadcasters = new Set();
    
    // Circuit breaker for rate limiting (429 errors)
    this._circuitOpen = false;
    this._circuitOpenUntil = 0;
    this._circuitBackoffMs = 60000; // Start with 60 second pause
    this._circuitMaxBackoffMs = 600000; // Max 10 minute pause
    this._pendingReconnects = []; // Queue of { broadcasterId, userAccessToken } to reconnect after circuit closes
  }
  
  // Circuit breaker: check if we should allow a reconnect
  // Returns true if reconnects should be blocked, false if allowed
  _isCircuitOpen() {
    if (!this._circuitOpen) return false;
    if (Date.now() >= this._circuitOpenUntil) {
      // Backoff period expired - allow reconnect attempts
      // NOTE: circuit stays "open" until _resetCircuitBreaker() on successful connection
      // This ensures backoff escalates if reconnects immediately fail again
      logger.info('AdEventService: circuit breaker backoff expired, draining pending reconnects');
      this._drainPendingReconnects();
      return false; // Allow reconnects
    }
    return true; // Still in backoff period, block reconnects
  }
  
  // Reset circuit breaker after successful connection
  _resetCircuitBreaker() {
    this._circuitOpen = false;
    this._circuitBackoffMs = 60000; // Reset to initial 60s
    if (this._circuitTimer) {
      clearTimeout(this._circuitTimer);
      this._circuitTimer = null;
    }
  }
  
  // Trip the circuit breaker on 429 errors
  _tripCircuitBreaker() {
    const wasOpen = this._circuitOpen;
    this._circuitOpen = true;
    // Exponential backoff: double the pause time on repeated trips, up to max
    if (wasOpen) {
      this._circuitBackoffMs = Math.min(this._circuitBackoffMs * 2, this._circuitMaxBackoffMs);
    }
    this._circuitOpenUntil = Date.now() + this._circuitBackoffMs;
    const pauseSec = Math.round(this._circuitBackoffMs / 1000);
    logger.warn('AdEventService: circuit breaker OPEN - pausing ALL reconnects', { 
      pauseSeconds: pauseSec,
      pendingCount: this._pendingReconnects.length
    });
    
    // Schedule a check to close the circuit and drain reconnects when backoff expires
    if (this._circuitTimer) clearTimeout(this._circuitTimer);
    this._circuitTimer = setTimeout(() => {
      this._circuitTimer = null;
      this._isCircuitOpen(); // This will drain pending reconnects
    }, this._circuitBackoffMs + 100);
  }
  
  // Queue a reconnect for when the circuit closes
  _queueReconnect(broadcasterId, userAccessToken) {
    // Avoid duplicates
    const exists = this._pendingReconnects.some(p => p.broadcasterId === broadcasterId);
    if (!exists) {
      this._pendingReconnects.push({ broadcasterId, userAccessToken });
      logger.debug('AdEventService: queued reconnect', { broadcasterId, queueSize: this._pendingReconnects.length });
    }
  }
  
  // Drain pending reconnects with staggered timing
  _drainPendingReconnects() {
    const pending = this._pendingReconnects.splice(0);
    if (pending.length === 0) return;
    logger.info('AdEventService: draining pending reconnects', { count: pending.length });
    
    let delay = 0;
    for (const { broadcasterId, userAccessToken } of pending) {
      setTimeout(() => {
        if (!this._isCircuitOpen()) {
          this._connectSession(broadcasterId, userAccessToken);
        } else {
          // Circuit tripped again, re-queue
          this._queueReconnect(broadcasterId, userAccessToken);
        }
      }, delay);
      delay += 2000; // 2 seconds between each reconnect attempt
    }
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
    logger.info('AdEventService initialized');
    await this._primeFromDatabase();
    await this._ensureSessions();

    // Start ad schedule polling as a best-effort for 30s pre-warn
    this._startSchedulePolling();
  }

  async shutdown() {
    this.enabled = false;
    // Clear circuit breaker timer
    if (this._circuitTimer) {
      clearTimeout(this._circuitTimer);
      this._circuitTimer = null;
    }
    // Clear pending reconnects
    this._pendingReconnects = [];
    // Close all per-broadcaster EventSub sessions
    for (const sess of this.sessions.values()) {
      try { if (sess.keepaliveTimeout) clearTimeout(sess.keepaliveTimeout); } catch (err) { logger.warn('AdEventService: failed to clear keepalive timeout during shutdown', { error: err?.message }); }
      try { if (sess.ws) sess.ws.close(); } catch (err) { logger.warn('AdEventService: failed to close WebSocket during shutdown', { error: err?.message }); }
    }
    this.sessions.clear();
    for (const t of this.pollIntervals.values()) clearInterval(t);
    for (const t of this.warnTimers.values()) clearTimeout(t);
    for (const t of this.endTimers.values()) clearTimeout(t);
    this.pollIntervals.clear();
    this.warnTimers.clear();
    this.endTimers.clear();
  }

  // ---- Per-broadcaster EventSub sessions ----
  async _ensureSessions() {
    const entries = this._getAllCredentials();
    logger.info('AdEventService: ensuring sessions for broadcasters', { count: entries.length });
    let delay = 0;
    for (const [broadcasterId, cred] of entries) {
      const key = String(broadcasterId);
      if (!this.sessions.has(key)) {
        // Stagger connections to avoid hitting Twitch rate limits
        setTimeout(() => this._connectSession(key, cred.access_token), delay);
        delay += 1000; // 1 second between each connection attempt
      }
    }
  }

  async _connectSession(broadcasterId, userAccessToken) {
    try {
      // Skip broadcasters with invalid tokens
      if (this._disabledBroadcasters.has(String(broadcasterId))) {
        logger.debug('AdEventService: skipping disabled broadcaster', { broadcasterId });
        return;
      }
      
      // Check circuit breaker before connecting
      if (this._isCircuitOpen()) {
        this._queueReconnect(broadcasterId, userAccessToken);
        return;
      }
      
      const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
      const session = { 
        ws, 
        sessionId: null, 
        keepaliveTimeout: null, 
        broadcasterId, 
        userAccessToken, 
        backoffMs: 2000,
        reconnectUrl: null 
      };
      this.sessions.set(String(broadcasterId), session);
      logger.info('AdEventService: connecting to EventSub WebSocket', { broadcasterId });

      const bindHandlers = () => {
        const s = session;
        if (!s || !s.ws) return;
        
        s.ws.on('open', () => {
          logger.info('AdEventService: EventSub WebSocket open', { broadcasterId });
        });

        s.ws.on('message', async (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            const type = msg?.metadata?.message_type || msg?.metadata?.messageType;
            const keep = msg?.payload?.session?.keepalive_timeout_seconds || 10;
            this._armKeepaliveFor(s, keep);
            
            if (type === 'session_welcome') {
              s.sessionId = msg?.payload?.session?.id;
              s.backoffMs = 2000; // Reset backoff on successful connection
              this._resetCircuitBreaker(); // Reset circuit breaker on successful connection
              logger.info('AdEventService: session established', { sessionId: s.sessionId, broadcasterId });
              await this._createSubscriptionFor(s, 'channel.ad_break.begin', '1', { broadcaster_user_id: broadcasterId }, s.userAccessToken);
              
            } else if (type === 'session_keepalive') {
              this._armKeepaliveFor(s, keep);
              
            } else if (type === 'session_reconnect') {
              const reconnectUrl = msg?.payload?.session?.reconnect_url;
              s.reconnectUrl = reconnectUrl;
              logger.info('AdEventService: reconnect requested', { broadcasterId, reconnectUrl });
              try { if (s.ws) s.ws.close(); } catch (err) { logger.warn('AdEventService: failed to close old WebSocket during reconnect', { error: err?.message, broadcasterId }); }
              s.ws = new WebSocket(reconnectUrl);
              bindHandlers(); // re-bind to the new socket
              
            } else if (type === 'notification') {
              const subType = msg?.payload?.subscription?.type;
              const messageId = msg?.metadata?.message_id || msg?.metadata?.messageId || null;
              const shouldProcess = this._shouldProcessMessageId(messageId);
              if (subType === 'channel.ad_break.begin' && shouldProcess) {
                await this._handleAdBreakBegin(msg?.payload?.event);
              }
              
            } else if (type === 'revocation') {
              logger.warn('AdEventService: subscription revoked', { broadcasterId, sub: msg?.payload?.subscription });
            }
          } catch (err) {
            logger.warn('AdEventService: failed to process EventSub message', { err: err?.message, broadcasterId });
          }
        });

        s.ws.on('close', (code, reason) => {
          logger.warn('AdEventService: EventSub WebSocket closed', { broadcasterId, code, reason: reason?.toString?.() });
          s.sessionId = null;
          
          if (this.enabled) {
            const isRateLimited = Number(code) === 1006;
            
            if (isRateLimited) {
              // Trip the circuit breaker - pause ALL reconnects
              this._tripCircuitBreaker();
              this._queueReconnect(broadcasterId, s.userAccessToken);
            } else if (this._isCircuitOpen()) {
              // Circuit is open, queue the reconnect
              this._queueReconnect(broadcasterId, s.userAccessToken);
            } else {
              // Normal reconnect with backoff (for non-429 errors like code 4003)
              const shouldBackoff = Number(code) === 4003;
              const prev = Number(s.backoffMs || 2000);
              const next = shouldBackoff ? Math.min(prev * 2, 120000) : 2000;
              s.backoffMs = next;
              const jitter = Math.floor(Math.random() * next * 0.25);
              const delay = next + jitter;
              logger.info('AdEventService: scheduling reconnect', { broadcasterId, delayMs: delay });
              setTimeout(() => this._connectSession(broadcasterId, s.userAccessToken), delay);
            }
          }
        });

        s.ws.on('error', (err) => {
          logger.error('AdEventService: WebSocket error', { broadcasterId, error: err?.message });
          if (err?.message?.includes('429')) {
            this._tripCircuitBreaker();
          }
        });
      };

      bindHandlers();
    } catch (err) {
      logger.error('AdEventService: failed to connect EventSub WebSocket', { broadcasterId, error: err?.message });
    }
  }
  
  _armKeepaliveFor(session, timeoutSec) {
    if (session.keepaliveTimeout) clearTimeout(session.keepaliveTimeout);
    const ms = (timeoutSec + 5) * 1000; // Add buffer
    session.keepaliveTimeout = setTimeout(() => {
      logger.warn('AdEventService: keepalive timeout, reconnecting', { broadcasterId: session.broadcasterId });
      try { if (session.ws) session.ws.close(); } catch (err) { logger.warn('AdEventService: failed to close WebSocket on keepalive timeout', { error: err?.message, broadcasterId: session.broadcasterId }); }
    }, ms);
  }

  _shouldProcessMessageId(messageId) {
    try {
      const id = messageId ? String(messageId) : null;
      if (!id) return true;
      const now = Date.now();
      if (this._seenMessageIds.has(id)) return false;
      this._seenMessageIds.set(id, now);
      if (this._seenMessageIds.size > 5000) {
        const cutoff = now - 10 * 60 * 1000;
        for (const [k, ts] of this._seenMessageIds.entries()) {
          if (!ts || ts < cutoff) this._seenMessageIds.delete(k);
        }
      }
      return true;
    } catch (err) {
      logger.warn('AdEventService: failed to process message dedup check', { error: err?.message });
      return true;
    }
  }

  async _createSubscriptionFor(session, type, version, condition, userAccessToken) {
    const token = userAccessToken;
    const makeReq = async (bearer) => axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type,
      version,
      condition,
      transport: {
        method: 'websocket',
        session_id: session.sessionId
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
      const responseBody = e?.response?.data;
      logger.debug('AdEventService: subscription request failed', { 
        status, 
        responseBody,
        type,
        broadcasterId: condition.broadcaster_user_id,
        sessionId: session.sessionId
      });
      if (status === 401 || status === 400) {
        const refreshed = await this._refreshTokenFor(condition.broadcaster_user_id);
        if (refreshed) {
          try {
            resp = await makeReq(refreshed);
          } catch (retryErr) {
            const retryBody = retryErr?.response?.data;
            logger.warn('AdEventService: subscription retry also failed', {
              status: retryErr?.response?.status,
              responseBody: retryBody,
              broadcasterId: condition.broadcaster_user_id
            });
            throw retryErr;
          }
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
    return resp?.data;
  }

  async _refreshTokenFor(broadcasterId) {
    try {
      const entry = TokenStore.getByTwitchUserId(String(broadcasterId));
      if (!entry || !entry.refreshToken) {
        logger.warn('AdEventService: no refresh token for broadcaster', { broadcasterId });
        return null;
      }
      const resp = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          grant_type: 'refresh_token',
          refresh_token: entry.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret
        }
      });
      const newAccess = resp?.data?.access_token;
      const newRefresh = resp?.data?.refresh_token || entry.refreshToken;
      if (newAccess) {
        TokenStore.setToken({
          accountId: entry.accountId,
          twitchUserId: String(broadcasterId),
          accessToken: newAccess,
          refreshToken: newRefresh,
          scopes: Array.from(entry.scopes || [])
        });
        // Update session if exists
        const sess = this.sessions.get(String(broadcasterId));
        if (sess) sess.userAccessToken = newAccess;
        logger.info('AdEventService: refreshed broadcaster token', { broadcasterId });
        return newAccess;
      }
    } catch (err) {
      const status = err?.response?.status;
      logger.warn('AdEventService: failed to refresh token', { broadcasterId, error: err?.message, status });
      // 400 means invalid_grant - token is revoked, user needs to re-auth
      if (status === 400) {
        this._disabledBroadcasters.add(String(broadcasterId));
        logger.warn('AdEventService: disabling broadcaster due to invalid refresh token', { broadcasterId });
      }
    }
    return null;
  }

  async _handleAdBreakBegin(event) {
    try {
      const broadcasterId = String(event?.broadcaster_user_id);
      const durationSec = Number(event?.duration_seconds || event?.duration || 0);

      let channelId = null;
      try {
        const prisma = this.channelManager.prisma;
        const chan = await prisma.channel.findFirst({ where: { twitchUserId: broadcasterId } });
        channelId = chan?.id || null;
      } catch (err) { logger.warn('AdEventService: failed to look up channel for ad break event', { error: err?.message, broadcasterId }); }

      if (!channelId) {
        logger.warn('AdEventService: unknown broadcaster for ad event', { broadcasterId });
        return;
      }

      logger.info('AdEventService: ad break starting', { channelId, durationSec });
      this.channelManager.setAdBreak(channelId, true);

      if (this.endTimers.has(channelId)) clearTimeout(this.endTimers.get(channelId));
      this.endTimers.set(channelId, setTimeout(() => {
        this.channelManager.setAdBreak(channelId, false);
        this.endTimers.delete(channelId);
        logger.info('AdEventService: ad break ended', { channelId });
      }, durationSec * 1000));
    } catch (err) {
      logger.warn('AdEventService: failed to handle ad break event', { error: err?.message });
    }
  }

  // ---- Credentials from TokenStore ----
  _getAllCredentials() {
    const entries = [];
    for (const [twitchUserId, entry] of TokenStore.byTwitchUserId.entries()) {
      if (entry.scopes?.has('channel:read:ads')) {
        entries.push([twitchUserId, { access_token: entry.accessToken, refresh_token: entry.refreshToken }]);
      }
    }
    return entries;
  }

  async _primeFromDatabase() {
    try {
      const prisma = this.channelManager?.prisma;
      if (!prisma) return;
      // Query accounts that have Twitch credentials
      const accounts = await prisma.account.findMany({
        where: { 
          twitchId: { not: null },
          twitchAccessToken: { not: null }
        },
        select: { 
          id: true,
          twitchId: true, 
          twitchAccessToken: true, 
          twitchRefreshToken: true, 
          twitchTokenScope: true 
        }
      });
      for (const acct of accounts) {
        if (!acct.twitchAccessToken || !acct.twitchId) continue;
        const scopes = (acct.twitchTokenScope || '').split(/[\s,]+/).filter(Boolean);
        TokenStore.setToken({
          accountId: acct.id,
          twitchUserId: acct.twitchId,
          accessToken: acct.twitchAccessToken,
          refreshToken: acct.twitchRefreshToken || null,
          scopes
        });
      }
      logger.info('AdEventService: primed TokenStore from database', { count: accounts.length });
    } catch (err) {
      logger.warn('AdEventService: failed to prime from database', { error: err?.message });
    }
  }

  // ---- Schedule Polling (fallback for 30s pre-warn) ----
  _startSchedulePolling() {
    const entries = this._getAllCredentials();
    for (const [broadcasterId] of entries) {
      if (this.pollIntervals.has(broadcasterId)) continue;
      const poll = async () => {
        try {
          const live = await this._isLive(broadcasterId);
          if (!live) return;
          const schedule = await this._fetchAdSchedule(broadcasterId);
          if (schedule?.nextAdAt) {
            const msUntil = schedule.nextAdAt - Date.now();
            if (msUntil > 0 && msUntil < 35000) {
              this._schedulePreWarn(broadcasterId, msUntil);
            }
          }
        } catch (err) { logger.warn('AdEventService: ad schedule poll failed', { error: err?.message, broadcasterId }); }
      };
      poll();
      this.pollIntervals.set(broadcasterId, setInterval(poll, 60000));
    }
  }

  async _isLive(broadcasterId) {
    const cached = this.liveCache.get(broadcasterId);
    if (cached && Date.now() - cached.ts < 60000) return cached.live;
    try {
      const token = await this._getAppToken();
      const resp = await axios.get('https://api.twitch.tv/helix/streams', {
        params: { user_id: broadcasterId },
        headers: { 'Client-ID': this.clientId, 'Authorization': `Bearer ${token}` }
      });
      const live = (resp?.data?.data?.length || 0) > 0;
      this.liveCache.set(broadcasterId, { live, ts: Date.now() });
      return live;
    } catch (err) {
      logger.warn('AdEventService: failed to check live status', { error: err?.message, broadcasterId });
      return false;
    }
  }

  async _fetchAdSchedule(broadcasterId) {
    try {
      const entry = TokenStore.getByTwitchUserId(String(broadcasterId));
      if (!entry) return null;
      const resp = await axios.get('https://api.twitch.tv/helix/channels/ads', {
        params: { broadcaster_id: broadcasterId },
        headers: { 'Client-ID': this.clientId, 'Authorization': `Bearer ${entry.accessToken}` }
      });
      const data = resp?.data?.data?.[0];
      if (data?.next_ad_at) {
        return { nextAdAt: new Date(data.next_ad_at).getTime() };
      }
    } catch (err) { logger.warn('AdEventService: failed to fetch ad schedule', { error: err?.message, broadcasterId }); }
    return null;
  }

  _schedulePreWarn(broadcasterId, msUntil) {
    // Not implemented - placeholder for 30s pre-warn
  }

  async _getAppToken() {
    if (this.appToken && Date.now() < this.appTokenExpiresAt - 60000) {
      return this.appToken;
    }
    const resp = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials'
      }
    });
    this.appToken = resp?.data?.access_token;
    this.appTokenExpiresAt = Date.now() + (resp?.data?.expires_in || 3600) * 1000;
    return this.appToken;
  }
}

module.exports = AdEventService;
