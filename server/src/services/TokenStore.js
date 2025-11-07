// Simple in-memory token store for Twitch user access tokens
// Keys by accountId and by Twitch user id (numeric string)

class TokenStore {
  constructor() {
    this.byAccountId = new Map(); // accountId -> { twitchUserId, accessToken, refreshToken, scopes: Set<string>, updatedAt }
    this.byTwitchUserId = new Map(); // twitchUserId -> { accountId, accessToken, refreshToken, scopes: Set<string>, updatedAt }
  }

  setToken({ accountId, twitchUserId, accessToken, refreshToken = null, scopes = [] }) {
    if (!accountId || !twitchUserId || !accessToken) return;
    const scopeSet = new Set(Array.isArray(scopes) ? scopes : String(scopes || '').split(/[\s,]+/).filter(Boolean));
    const record = { twitchUserId: String(twitchUserId), accessToken, refreshToken, scopes: scopeSet, updatedAt: Date.now(), accountId };
    this.byAccountId.set(String(accountId), record);
    this.byTwitchUserId.set(String(twitchUserId), record);
  }

  getByAccountId(accountId) {
    return this.byAccountId.get(String(accountId)) || null;
  }

  getByTwitchUserId(twitchUserId) {
    return this.byTwitchUserId.get(String(twitchUserId)) || null;
  }

  // Returns an array of [twitchUserId, { access_token, refresh_token }]
  listBroadcasterCredentials() {
    const entries = [];
    for (const [uid, rec] of this.byTwitchUserId.entries()) {
      entries.push([uid, { access_token: rec.accessToken, refresh_token: rec.refreshToken || null }]);
    }
    return entries;
  }
}

module.exports = new TokenStore();

