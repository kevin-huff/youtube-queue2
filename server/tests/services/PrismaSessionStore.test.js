const PrismaSessionStore = require('../../src/services/PrismaSessionStore');

const buildStore = () => {
  const db = {
    session: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    }
  };
  const store = new PrismaSessionStore({ db });
  return { store, db };
};

const SESSION = { cookie: { maxAge: 1000 * 60 * 60 }, passport: { user: 'acct-1' } };

describe('PrismaSessionStore', () => {
  test('get returns parsed session data for a live row', (done) => {
    const { store, db } = buildStore();
    db.session.findUnique.mockResolvedValue({
      sid: 'abc',
      data: JSON.stringify(SESSION),
      expiresAt: new Date(Date.now() + 60_000)
    });

    store.get('abc', (err, session) => {
      expect(err).toBeNull();
      expect(session.passport.user).toBe('acct-1');
      done();
    });
  });

  test('get treats missing rows as no session', (done) => {
    const { store, db } = buildStore();
    db.session.findUnique.mockResolvedValue(null);

    store.get('missing', (err, session) => {
      expect(err).toBeNull();
      expect(session).toBeNull();
      done();
    });
  });

  test('get destroys and ignores expired rows', (done) => {
    const { store, db } = buildStore();
    db.session.findUnique.mockResolvedValue({
      sid: 'old',
      data: JSON.stringify(SESSION),
      expiresAt: new Date(Date.now() - 1000)
    });

    store.get('old', (err, session) => {
      expect(err).toBeNull();
      expect(session).toBeNull();
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { sid: 'old' } });
      done();
    });
  });

  test('get destroys unparseable rows instead of erroring', (done) => {
    const { store, db } = buildStore();
    db.session.findUnique.mockResolvedValue({
      sid: 'bad',
      data: '{corrupt',
      expiresAt: new Date(Date.now() + 60_000)
    });

    store.get('bad', (err, session) => {
      expect(err).toBeNull();
      expect(session).toBeNull();
      expect(db.session.deleteMany).toHaveBeenCalled();
      done();
    });
  });

  test('set upserts with expiry derived from cookie maxAge', (done) => {
    const { store, db } = buildStore();
    const before = Date.now();

    store.set('abc', SESSION, (err) => {
      expect(err).toBeNull();
      const args = db.session.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ sid: 'abc' });
      const expiry = args.create.expiresAt.getTime();
      expect(expiry).toBeGreaterThanOrEqual(before + SESSION.cookie.maxAge - 1000);
      expect(expiry).toBeLessThanOrEqual(Date.now() + SESSION.cookie.maxAge + 1000);
      done();
    });
  });

  test('set falls back to the default TTL without cookie maxAge', (done) => {
    const { store, db } = buildStore();

    store.set('abc', { passport: {} }, (err) => {
      expect(err).toBeNull();
      const args = db.session.upsert.mock.calls[0][0];
      const expiry = args.create.expiresAt.getTime();
      expect(expiry).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
      done();
    });
  });

  test('touch extends expiry without rewriting data', (done) => {
    const { store, db } = buildStore();

    store.touch('abc', SESSION, (err) => {
      expect(err).toBeNull();
      const args = db.session.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({ sid: 'abc' });
      expect(args.data.expiresAt).toBeInstanceOf(Date);
      expect(args.data.data).toBeUndefined();
      done();
    });
  });

  test('destroy deletes the row', (done) => {
    const { store, db } = buildStore();

    store.destroy('abc', (err) => {
      expect(err).toBeNull();
      expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { sid: 'abc' } });
      done();
    });
  });

  test('prune removes expired rows and reports the count', async () => {
    const { store, db } = buildStore();
    db.session.deleteMany.mockResolvedValue({ count: 4 });

    await expect(store.prune()).resolves.toBe(4);
    const args = db.session.deleteMany.mock.calls[0][0];
    expect(args.where.expiresAt.lte).toBeInstanceOf(Date);
  });

  test('surfaces db errors through the callback', (done) => {
    const { store, db } = buildStore();
    db.session.findUnique.mockRejectedValue(new Error('db down'));

    store.get('abc', (err) => {
      expect(err).toBeInstanceOf(Error);
      done();
    });
  });
});
