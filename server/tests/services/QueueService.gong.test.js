const QueueService = require('../../src/services/QueueService');

const buildService = ({ isVip = false } = {}) => {
  const io = { emit: jest.fn() };
  const service = new QueueService(io, 'testchannel');
  service.currentlyPlaying = {
    id: 42,
    title: 'Test Video',
    isVip
  };
  return service;
};

describe('QueueService gong controls', () => {
  test('judge can gong a normal video', () => {
    const service = buildService();
    const state = service.setJudgeGong(42, 'judge-1', 'Judge One', true);
    expect(state.entries).toEqual([
      expect.objectContaining({ id: 'judge-1', type: 'judge' })
    ]);
  });

  test('judge can undo their gong', () => {
    const service = buildService();
    service.setJudgeGong(42, 'judge-1', 'Judge One', true);
    const state = service.setJudgeGong(42, 'judge-1', 'Judge One', false);
    expect(state.entries).toEqual([]);
  });

  test('owner can gong a normal video', () => {
    const service = buildService();
    const state = service.setOwnerGong(42, 'acct-1', 'Owner', true);
    expect(state.entries).toEqual([
      expect.objectContaining({ id: 'owner', type: 'owner' })
    ]);
  });

  test('judge gong is rejected for VIP videos with a 400', () => {
    const service = buildService({ isVip: true });
    expect(() => service.setJudgeGong(42, 'judge-1', 'Judge One', true)).toThrow(
      expect.objectContaining({ message: 'The gong is disabled for VIP videos', status: 400 })
    );
    expect(service.getGongState().entries).toEqual([]);
  });

  test('owner gong is rejected for VIP videos with a 400', () => {
    const service = buildService({ isVip: true });
    expect(() => service.setOwnerGong(42, 'acct-1', 'Owner', true)).toThrow(
      expect.objectContaining({ message: 'The gong is disabled for VIP videos', status: 400 })
    );
    expect(service.getGongState().entries).toEqual([]);
  });

  test('gong is rejected when the item is not the currently playing video', () => {
    const service = buildService();
    expect(() => service.setJudgeGong(99, 'judge-1', 'Judge One', true)).toThrow(
      'Gongs only apply to the currently playing video'
    );
  });

  test('gong is rejected when nothing is playing', () => {
    const service = buildService();
    service.currentlyPlaying = null;
    expect(() => service.setJudgeGong(42, 'judge-1', 'Judge One', true)).toThrow(
      'No video currently playing'
    );
  });
});
