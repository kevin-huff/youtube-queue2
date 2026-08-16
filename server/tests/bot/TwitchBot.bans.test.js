const TwitchBot = require('../../src/bot/TwitchBot');

const buildBot = ({ settings = {} } = {}) => {
  const store = { ...settings };
  const queueService = {
    getSetting: jest.fn(async (key, fallback) => (key in store ? store[key] : fallback)),
    updateSetting: jest.fn(async (key, value) => {
      store[key] = value;
    }),
    logSubmission: jest.fn(async () => {})
  };
  const channelManager = {
    getActiveChannels: jest.fn(() => ['testchannel']),
    isChannelActive: jest.fn(() => true),
    getQueueService: jest.fn(() => queueService)
  };
  const io = { emit: jest.fn() };
  const bot = new TwitchBot(channelManager, io);
  // never connect to Twitch in tests
  bot.sendMessage = jest.fn();
  bot.sendPersonalityMessage = jest.fn(async () => {});
  return { bot, queueService, store };
};

describe('TwitchBot ban persistence', () => {
  test('loads persisted bans into the in-memory set', async () => {
    const { bot } = buildBot({
      settings: { banned_users: JSON.stringify(['Spammer', 'troll2']) }
    });

    await bot._loadBannedUsers('testchannel');

    const banned = bot.channelBannedUsers.get('testchannel');
    expect(banned.has('spammer')).toBe(true);
    expect(banned.has('troll2')).toBe(true);
  });

  test('handles missing or corrupt persisted data gracefully', async () => {
    const { bot } = buildBot({ settings: { banned_users: 'not-json{' } });
    bot.channelBannedUsers.set('testchannel', new Set(['existing']));

    await bot._loadBannedUsers('testchannel');

    // corrupt payload leaves the existing in-memory state untouched
    expect(bot.channelBannedUsers.get('testchannel').has('existing')).toBe(true);
  });

  test('ban command persists the updated list', async () => {
    const { bot, queueService, store } = buildBot();

    await bot.handleBanCommand('#testchannel', 'testchannel', '@BadActor');

    expect(bot.channelBannedUsers.get('testchannel').has('badactor')).toBe(true);
    expect(queueService.updateSetting).toHaveBeenCalledWith(
      'banned_users',
      expect.any(String)
    );
    expect(JSON.parse(store.banned_users)).toEqual(['badactor']);
  });

  test('unban command persists the removal', async () => {
    const { bot, store } = buildBot({
      settings: { banned_users: JSON.stringify(['badactor', 'other']) }
    });
    await bot._loadBannedUsers('testchannel');

    await bot.handleUnbanCommand('#testchannel', 'testchannel', '@BadActor');

    expect(bot.channelBannedUsers.get('testchannel').has('badactor')).toBe(false);
    expect(JSON.parse(store.banned_users)).toEqual(['other']);
  });

  test('persistence failures do not break the ban command', async () => {
    const { bot, queueService } = buildBot();
    queueService.updateSetting.mockRejectedValue(new Error('db down'));

    await expect(bot.handleBanCommand('#testchannel', 'testchannel', '@BadActor'))
      .resolves.not.toThrow();
    expect(bot.channelBannedUsers.get('testchannel').has('badactor')).toBe(true);
  });
});
