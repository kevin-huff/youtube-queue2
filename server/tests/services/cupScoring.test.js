const {
  SHRUNK_TOP_K,
  DEFAULT_CUP_BASELINE,
  buildVideoScores,
  buildPreviousAverageMap,
  applyDuplicatePenalty,
  computeCupBaseline,
  computeStandings,
  computeCupScoring
} = require('../../src/services/cupScoring');

const item = (id, submitter, scores, extra = {}) => ({
  id,
  videoId: `vid-${id}`,
  videoUrl: `https://youtube.com/watch?v=vid-${id}`,
  title: `Video ${id}`,
  thumbnailUrl: null,
  submitterUsername: submitter,
  status: 'SCORED',
  playedAt: new Date(2026, 0, id),
  createdAt: new Date(2026, 0, id),
  judgeScores: scores.map((s, i) => ({ score: s, judgeName: `J${i}`, comment: null, isLocked: true })),
  ...extra
});

describe('cupScoring.buildVideoScores', () => {
  test('computes rounded totals and averages, full shape', () => {
    const [video] = buildVideoScores([item(1, 'alice', [4, 5])]);
    expect(video).toMatchObject({
      queueItemId: 1,
      submitterUsername: 'alice',
      publicSubmitterName: 'alice',
      judgeCount: 2,
      totalScore: 9,
      averageScore: 4.5,
      status: 'SCORED'
    });
    expect(video.judgeScores).toHaveLength(2);
  });

  test('unscored items produce null scores', () => {
    const [video] = buildVideoScores([item(1, 'alice', [])]);
    expect(video.judgeCount).toBe(0);
    expect(video.averageScore).toBeNull();
    expect(video.totalScore).toBeNull();
    expect(video.judgeScores).toEqual([]);
  });

  test('prefers the submitter relation username over the raw column', () => {
    const [video] = buildVideoScores([
      item(1, 'raw_name', [3], { submitter: { twitchUsername: 'relation_name' } })
    ]);
    expect(video.submitterUsername).toBe('relation_name');
  });

  test('minimal detail omits presentation fields', () => {
    const [video] = buildVideoScores([item(1, 'alice', [4])], { detail: 'minimal' });
    expect(video).toEqual({
      queueItemId: 1,
      submitterUsername: 'alice',
      judgeCount: 1,
      totalScore: 4,
      averageScore: 4
    });
  });
});

describe('cupScoring.buildPreviousAverageMap', () => {
  test('maps each rerun to the immediately preceding run average', () => {
    const runs = [
      { id: 10, videoId: 'v1', judgeScores: [{ score: 3 }] },
      { id: 11, videoId: 'v1', judgeScores: [{ score: 4 }] },
      { id: 12, videoId: 'v1', judgeScores: [{ score: 2 }] },
      { id: 20, videoId: 'v2', judgeScores: [] }
    ];
    const map = buildPreviousAverageMap(runs);
    expect(map.get(10)).toBeUndefined(); // first run has no predecessor
    expect(map.get(11)).toBe(3);
    expect(map.get(12)).toBe(4); // preceding run only, not the max
    expect(map.get(20)).toBeUndefined();
  });
});

describe('cupScoring.applyDuplicatePenalty', () => {
  const videos = [
    { queueItemId: 1, submitterUsername: 'a', judgeCount: 2, averageScore: 3, totalScore: 6 },
    { queueItemId: 2, submitterUsername: 'b', judgeCount: 2, averageScore: 4, totalScore: 8 }
  ];

  test('zeroes reruns that do not strictly beat the previous average', () => {
    const prev = new Map([[1, 3], [2, 3.5]]);
    const result = applyDuplicatePenalty(videos, prev);
    expect(result[0].averageScore).toBe(0); // tie -> penalized
    expect(result[0].totalScore).toBe(0);
    expect(result[1].averageScore).toBe(4); // strictly greater -> kept
  });

  test('exempt items skip the penalty entirely', () => {
    const prev = new Map([[1, 5]]);
    const result = applyDuplicatePenalty(videos, prev, { exemptItemIds: new Set([1]) });
    expect(result[0].averageScore).toBe(3);
  });
});

describe('cupScoring.computeCupBaseline', () => {
  test('averages the scored videos', () => {
    const baseline = computeCupBaseline([
      { averageScore: 2 },
      { averageScore: 4 },
      { averageScore: null }
    ]);
    expect(baseline).toBe(3);
  });

  test('falls back to the default with no scored videos', () => {
    expect(computeCupBaseline([{ averageScore: null }])).toBe(DEFAULT_CUP_BASELINE);
  });
});

describe('cupScoring.computeStandings', () => {
  test('pads to K with the baseline and ranks by padded average', () => {
    const videos = [
      { queueItemId: 1, submitterUsername: 'alice', judgeCount: 3, averageScore: 5 },
      { queueItemId: 2, submitterUsername: 'bob', judgeCount: 3, averageScore: 4 }
    ];
    const standings = computeStandings(videos, { baseline: 3 });

    // alice: (5 + 4*3) / 5 = 3.4 ; bob: (4 + 4*3) / 5 = 3.2
    expect(standings[0]).toMatchObject({ submitterUsername: 'alice', averageScore: 3.4, rank: 1 });
    expect(standings[1]).toMatchObject({ submitterUsername: 'bob', averageScore: 3.2, rank: 2 });
  });

  test('only the best K scores count toward the padded average', () => {
    const scores = [5, 5, 5, 5, 5, 1, 1];
    const videos = scores.map((s, i) => ({
      queueItemId: i, submitterUsername: 'alice', judgeCount: 1, averageScore: s
    }));
    const standings = computeStandings(videos, { baseline: 3 });
    expect(standings[0].averageScore).toBe(5); // the two 1s fall outside top-5
    expect(standings[0].videoCount).toBe(7);
    expect(SHRUNK_TOP_K).toBe(5);
  });

  test('ties break by videoCount then judgeCount', () => {
    const videos = [
      { queueItemId: 1, submitterUsername: 'one_video', judgeCount: 9, averageScore: 4 },
      { queueItemId: 2, submitterUsername: 'two_videos', judgeCount: 1, averageScore: 4 },
      { queueItemId: 3, submitterUsername: 'two_videos', judgeCount: 1, averageScore: 4 }
    ];
    const standings = computeStandings(videos, { baseline: 4 });
    expect(standings[0].submitterUsername).toBe('two_videos');
    expect(standings[1].submitterUsername).toBe('one_video');
  });

  test('extraEntries join the aggregation without affecting the baseline input', () => {
    const videos = [
      { queueItemId: 1, submitterUsername: 'alice', judgeCount: 2, averageScore: 4 }
    ];
    const standings = computeStandings(videos, {
      baseline: 4,
      extraEntries: [{ submitterUsername: 'alice', score: 5, judgeCount: 0 }]
    });
    // alice: (5 + 4 + 3*4) / 5 = 4.2 ; judgeCount unchanged by the extra entry
    expect(standings[0].averageScore).toBe(4.2);
    expect(standings[0].videoCount).toBe(2);
    expect(standings[0].judgeCount).toBe(2);
  });

  test('an extra entry can introduce a brand-new submitter', () => {
    const standings = computeStandings([], {
      baseline: 3,
      extraEntries: [{ submitterUsername: 'newbie', score: 5, judgeCount: 0 }]
    });
    expect(standings).toHaveLength(1);
    expect(standings[0].submitterUsername).toBe('newbie');
  });
});

describe('cupScoring.computeCupScoring (full pipeline)', () => {
  test('matches the historical end-to-end behavior', () => {
    // alice scores 4.5, bob reruns a video and fails to beat 4 -> zeroed
    const queueItems = [
      item(1, 'alice', [4, 5]),
      item(2, 'bob', [3, 4], { videoId: 'rerun-vid' })
    ];
    const terminalItems = [
      { id: 99, videoId: 'rerun-vid', judgeScores: [{ score: 4 }] },
      { id: 2, videoId: 'rerun-vid', judgeScores: [{ score: 3 }, { score: 4 }] }
    ];

    const { videos, standings, cupBaseline } = computeCupScoring({ queueItems, terminalItems });

    expect(videos.find((v) => v.queueItemId === 2).averageScore).toBe(0);
    // baseline = mean(4.5, 0) = 2.25
    expect(cupBaseline).toBe(2.25);
    // alice: (4.5 + 4*2.25)/5 = 2.7 ; bob: (0 + 4*2.25)/5 = 1.8
    expect(standings[0]).toMatchObject({ submitterUsername: 'alice', averageScore: 2.7, rank: 1 });
    expect(standings[1]).toMatchObject({ submitterUsername: 'bob', averageScore: 1.8, rank: 2 });
  });
});
