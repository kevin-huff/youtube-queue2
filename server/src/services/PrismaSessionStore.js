const { Store } = require('express-session');
const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // matches the session cookie maxAge

// express-session store backed by the sessions table, so logins survive
// restarts and deploys. The DB handle resolves lazily because the store is
// constructed before initializeDatabase() runs. Expired rows are removed by
// the periodic prune() the server drives, and defensively on read.
class PrismaSessionStore extends Store {
  constructor(options = {}) {
    super();
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this._db = options.db || null;
  }

  get db() {
    if (!this._db) {
      this._db = getDatabase();
    }
    return this._db;
  }

  _expiresAt(session) {
    const maxAge = session?.cookie?.maxAge;
    const ttl = typeof maxAge === 'number' && maxAge > 0 ? maxAge : this.ttlMs;
    return new Date(Date.now() + ttl);
  }

  get(sid, callback) {
    this.db.session.findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return callback(null, null);
        if (row.expiresAt.getTime() <= Date.now()) {
          return this.destroy(sid, () => callback(null, null));
        }
        try {
          callback(null, JSON.parse(row.data));
        } catch (parseError) {
          logger.warn('Discarding unparseable session row', { sid, error: parseError?.message });
          this.destroy(sid, () => callback(null, null));
        }
      })
      .catch((error) => callback(error));
  }

  set(sid, session, callback = () => {}) {
    let data;
    try {
      data = JSON.stringify(session);
    } catch (serializeError) {
      return callback(serializeError);
    }
    const expiresAt = this._expiresAt(session);

    this.db.session.upsert({
      where: { sid },
      update: { data, expiresAt },
      create: { sid, data, expiresAt }
    })
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  destroy(sid, callback = () => {}) {
    this.db.session.deleteMany({ where: { sid } })
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  touch(sid, session, callback = () => {}) {
    this.db.session.updateMany({
      where: { sid },
      data: { expiresAt: this._expiresAt(session) }
    })
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  async prune() {
    const result = await this.db.session.deleteMany({
      where: { expiresAt: { lte: new Date() } }
    });
    if (result.count > 0) {
      logger.debug?.('Pruned expired sessions', { removed: result.count });
    }
    return result.count;
  }
}

module.exports = PrismaSessionStore;
