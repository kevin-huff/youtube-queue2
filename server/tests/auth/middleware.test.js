const {
  ensureAuthenticated,
  ensureChannelOwnership,
  requireChannelRole,
  requireCupRole
} = require('../../src/auth/middleware');

const createRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

describe('auth middleware', () => {
  test('ensureAuthenticated rejects when not authed', () => {
    const req = { isAuthenticated: () => false };
    const res = createRes();
    const next = jest.fn();

    ensureAuthenticated(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body?.requiresLogin).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  test('ensureChannelOwnership allows when channel owned via cached channels', async () => {
    const req = {
      params: { channelId: 'mychan' },
      user: { id: 'acct', channels: [{ id: 'mychan' }] },
      isAuthenticated: () => true,
      app: { get: jest.fn(() => null) } // no channelManager -> fallback to cached channels
    };
    const res = createRes();
    const next = jest.fn();

    await ensureChannelOwnership(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.channelId).toBe('mychan');
  });

  test('requireChannelRole expands OWNER to HOST/PRODUCER', () => {
    const req = {
      isAuthenticated: () => true,
      user: { channels: [{ id: 'chan', ownershipRole: 'OWNER', roles: [] }] },
      params: { channelId: 'chan' }
    };
    const res = createRes();
    const next = jest.fn();

    requireChannelRole('HOST')(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalled();
  });

  test('requireCupRole allows cup-specific role match', () => {
    const req = {
      isAuthenticated: () => true,
      user: {
        channels: [{
          id: 'chan',
          cupRoles: { cup123: ['JUDGE'] },
          roles: []
        }]
      },
      params: { channelId: 'chan', cupId: 'cup123' }
    };
    const res = createRes();
    const next = jest.fn();

    requireCupRole('JUDGE')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('requireCupRole rejects when missing cupId', () => {
    const req = {
      isAuthenticated: () => true,
      user: { channels: [{ id: 'chan', roles: ['HOST'] }] },
      params: { channelId: 'chan' }
    };
    const res = createRes();
    const next = jest.fn();

    requireCupRole('HOST')(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/cup id/i);
    expect(next).not.toHaveBeenCalled();
  });
});
