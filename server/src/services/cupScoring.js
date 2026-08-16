// Shared cup scoring math. Pure functions only — callers fetch the rows and
// persist/emit the results. This is the single home for the standings
// pipeline that was previously duplicated across ChannelManager
// (rebuildCupStandings / buildCupScoreData) and QueueService
// (_emitStandingsPreviewForCurrentVoting).

const SHRUNK_TOP_K = 5;
const DEFAULT_CUP_BASELINE = 3.4;
const SCORE_PRECISION = 5;

const round = (value) => Number(value.toFixed(SCORE_PRECISION));

// Per-item score summaries from queue items hydrated with judgeScores (and
// optionally submitter). detail 'full' produces the rich shape persisted and
// served by ChannelManager; 'minimal' matches the live preview's needs.
const buildVideoScores = (queueItems, { detail = 'full' } = {}) => {
  return queueItems.map((item) => {
    const judgeScores = Array.isArray(item.judgeScores) ? item.judgeScores : [];
    const judgeCount = judgeScores.length;
    const submitterUsername = item.submitter?.twitchUsername || item.submitterUsername;

    const totalScore = judgeCount
      ? judgeScores.reduce((sum, score) => sum + Number(score.score), 0)
      : null;
    const averageScore = judgeCount ? totalScore / judgeCount : null;

    const base = {
      queueItemId: item.id,
      submitterUsername,
      judgeCount,
      totalScore: judgeCount ? round(totalScore) : null,
      averageScore: judgeCount ? round(averageScore) : null
    };

    if (detail === 'minimal') {
      return base;
    }

    return {
      ...base,
      videoId: item.videoId,
      videoUrl: item.videoUrl,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      publicSubmitterName: submitterUsername,
      status: item.status,
      judgeScores: judgeScores.map((score) => ({
        score: Number(score.score),
        judgeName: score.judgeName || score.judgeSession?.judgeName || 'Anonymous',
        comment: score.comment,
        isLocked: score.isLocked
      })),
      playedAt: item.playedAt,
      createdAt: item.createdAt
    };
  });
};

// Map of queueItemId -> the immediately preceding run's average for the same
// videoId. terminalItems must already be ordered playedAt asc, createdAt asc.
const buildPreviousAverageMap = (terminalItems) => {
  const byVideo = new Map();
  for (const item of terminalItems) {
    const arr = byVideo.get(item.videoId) || [];
    arr.push(item);
    byVideo.set(item.videoId, arr);
  }

  const prevAverageByItemId = new Map();
  for (const items of byVideo.values()) {
    const averages = items.map((it) => {
      const scores = Array.isArray(it.judgeScores) ? it.judgeScores : [];
      if (!scores.length) return null;
      const total = scores.reduce((sum, score) => sum + Number(score.score), 0);
      return total / scores.length;
    });
    for (let i = 1; i < items.length; i += 1) {
      const prev = averages[i - 1];
      if (typeof prev === 'number') {
        prevAverageByItemId.set(items[i].id, round(prev));
      }
    }
  }
  return prevAverageByItemId;
};

// Duplicate rule: a rerun that doesn't strictly beat its previous run scores 0.
// exemptItemIds skips the penalty (e.g. golden-buzzer saves).
const applyDuplicatePenalty = (videos, prevAverageByItemId, { exemptItemIds } = {}) => {
  const exempt = exemptItemIds instanceof Set ? exemptItemIds : new Set(exemptItemIds || []);
  return videos.map((video) => {
    if (exempt.has(video.queueItemId)) {
      return video;
    }
    const prev = prevAverageByItemId.get(video.queueItemId);
    if (typeof video.averageScore === 'number' && typeof prev === 'number') {
      if (!(video.averageScore > prev)) {
        return { ...video, averageScore: 0, totalScore: 0 };
      }
    }
    return video;
  });
};

// Baseline C for top-K padding: mean of the cup's (penalized) video averages.
const computeCupBaseline = (videos, { fallback = DEFAULT_CUP_BASELINE } = {}) => {
  const scoredValues = videos
    .map((video) => (typeof video.averageScore === 'number' ? video.averageScore : null))
    .filter((value) => typeof value === 'number');
  return scoredValues.length > 0
    ? scoredValues.reduce((sum, value) => sum + value, 0) / scoredValues.length
    : fallback;
};

// Shrunk top-K standings: each submitter's best K video averages, padded to K
// entries with the cup baseline, then averaged. extraEntries lets the live
// preview inject the in-progress video ({ submitterUsername, score, judgeCount }).
const computeStandings = (videos, {
  baseline = DEFAULT_CUP_BASELINE,
  k = SHRUNK_TOP_K,
  extraEntries = []
} = {}) => {
  const byUser = new Map();
  const addScore = (submitterUsername, score, judgeCount) => {
    const existing = byUser.get(submitterUsername) || {
      submitterUsername,
      scores: [],
      totalJudgeCount: 0
    };
    existing.scores.push(score);
    existing.totalJudgeCount += judgeCount || 0;
    byUser.set(submitterUsername, existing);
  };

  videos
    .filter((video) => typeof video.averageScore === 'number')
    .forEach((video) => addScore(video.submitterUsername, video.averageScore, video.judgeCount));

  extraEntries.forEach((entry) => {
    if (entry && entry.submitterUsername && typeof entry.score === 'number') {
      addScore(entry.submitterUsername, entry.score, entry.judgeCount);
    }
  });

  return Array.from(byUser.values())
    .map((entry) => {
      const sorted = entry.scores.slice().sort((a, b) => b - a);
      const n = Math.min(sorted.length, k);
      const sumTop = sorted.slice(0, n).reduce((sum, value) => sum + value, 0);
      const padded = (sumTop + (k - n) * baseline) / k;
      const totalScore = entry.scores.reduce((sum, value) => sum + value, 0);
      return {
        submitterUsername: entry.submitterUsername,
        totalScore: round(totalScore),
        averageScore: round(padded),
        judgeCount: entry.totalJudgeCount,
        videoCount: entry.scores.length
      };
    })
    .sort((a, b) => {
      if ((b.averageScore ?? 0) !== (a.averageScore ?? 0)) {
        return (b.averageScore ?? 0) - (a.averageScore ?? 0);
      }
      if ((b.videoCount || 0) !== (a.videoCount || 0)) {
        return (b.videoCount || 0) - (a.videoCount || 0);
      }
      return (b.judgeCount || 0) - (a.judgeCount || 0);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
};

// Full pipeline convenience wrapper.
const computeCupScoring = ({
  queueItems,
  terminalItems,
  exemptItemIds,
  extraEntries = [],
  detail = 'full'
} = {}) => {
  const videos = buildVideoScores(queueItems || [], { detail });
  const prevAverageByItemId = buildPreviousAverageMap(terminalItems || []);
  const penalizedVideos = applyDuplicatePenalty(videos, prevAverageByItemId, { exemptItemIds });
  const cupBaseline = computeCupBaseline(penalizedVideos);
  const standings = computeStandings(penalizedVideos, {
    baseline: cupBaseline,
    extraEntries
  });
  return { videos: penalizedVideos, standings, cupBaseline };
};

module.exports = {
  SHRUNK_TOP_K,
  DEFAULT_CUP_BASELINE,
  SCORE_PRECISION,
  buildVideoScores,
  buildPreviousAverageMap,
  applyDuplicatePenalty,
  computeCupBaseline,
  computeStandings,
  computeCupScoring
};
