const tokenStore = require('../../src/services/TokenStore');

describe('TokenStore', () => {
  beforeEach(() => {
    tokenStore.byAccountId.clear();
    tokenStore.byTwitchUserId.clear();
  });

  test('stores and retrieves tokens by account and Twitch user id', () => {
    tokenStore.setToken({
      accountId: 'acct-1',
      twitchUserId: '12345',
      accessToken: 'access-abc',
      refreshToken: 'refresh-xyz',
      scopes: ['chat:read', 'channel:read:ads']
    });

    const byAccount = tokenStore.getByAccountId('acct-1');
    expect(byAccount).toBeTruthy();
    expect(byAccount.twitchUserId).toBe('12345');
    expect(byAccount.accessToken).toBe('access-abc');
    expect(byAccount.scopes.has('chat:read')).toBe(true);
    expect(byAccount.scopes.has('channel:read:ads')).toBe(true);

    const byUser = tokenStore.getByTwitchUserId('12345');
    expect(byUser).toBeTruthy();
    expect(byUser.accessToken).toBe('access-abc');
  });

  test('ignores incomplete token payloads', () => {
    tokenStore.setToken({ accountId: 'acct', twitchUserId: null, accessToken: 'x' });
    tokenStore.setToken({ accountId: null, twitchUserId: '123', accessToken: 'x' });
    tokenStore.setToken({ accountId: 'acct', twitchUserId: '123', accessToken: null });

    expect(tokenStore.byAccountId.size).toBe(0);
    expect(tokenStore.byTwitchUserId.size).toBe(0);
  });

  test('lists broadcaster credentials in expected shape', () => {
    tokenStore.setToken({
      accountId: 'acct-1',
      twitchUserId: '12345',
      accessToken: 'access-abc',
      refreshToken: 'refresh-xyz'
    });

    const creds = tokenStore.listBroadcasterCredentials();
    expect(creds).toEqual([
      ['12345', { access_token: 'access-abc', refresh_token: 'refresh-xyz' }]
    ]);
  });
});
