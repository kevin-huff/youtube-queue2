const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');
const anonNames = require('../constants/anonNames');

const ACTIVE_QUEUE_STATUSES = ['PENDING', 'APPROVED', 'TOP_EIGHT', 'PLAYING'];
const ORDERABLE_QUEUE_STATUSES = ['TOP_EIGHT', 'APPROVED', 'PENDING'];
const TERMINAL_QUEUE_STATUSES = ['SCORED', 'PLAYED', 'SKIPPED', 'REMOVED', 'REJECTED', 'ELIMINATED'];
const DUPLICATE_ACTIVE_STATUSES = ['PENDING', 'APPROVED', 'TOP_EIGHT', 'PLAYING'];
const DUPLICATE_HISTORY_STATUSES = TERMINAL_QUEUE_STATUSES;

const CUP_INCLUDE_SELECTION = {
  id: true,
  title: true,
  theme: true,
  status: true
};

const SUBMITTER_SELECT = {
  twitchUsername: true,
  role: true
};

const MAX_ALIAS_ATTEMPTS = Math.max(anonNames.length * 2, 200);
const MAX_MODERATION_NOTE_LENGTH = 280;
const DEFAULT_SOCIAL_MIN_VOTES = 3;
const DEFAULT_SOCIAL_GLOBAL_MEAN = 3.4;
const VOTING_STAGES = {
  COLLECTING: 'collecting',
  REVEALING: 'revealing',
  AVERAGE: 'average',
  SOCIAL: 'social',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const createSeededRandom = (seed) => {
  let value = Number.isFinite(seed) ? seed : Date.now();
  if (Number.isNaN(value)) {
    value = Date.now();
  }

  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithSeed = (items, seed) => {
  const random = createSeededRandom(seed);
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
};

// Cached historical YouTube IDs from docs/historical_youtube.json (optional)
let _HISTORICAL_YT_IDS = null;
const _loadHistoricalYouTubeIds = async () => {
  if (_HISTORICAL_YT_IDS) return _HISTORICAL_YT_IDS;
  try {
    const fs = require('fs');
    const path = require('path');
    const candidates = [
      path.resolve(process.cwd(), '../docs/historical_youtube.json'),
      path.resolve(process.cwd(), 'docs/historical_youtube.json'),
      path.join(__dirname, '../../../docs/historical_youtube.json')
    ];
    let filePath = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) { filePath = p; break; }
    }
    if (!filePath) {
      _HISTORICAL_YT_IDS = new Set();
      return _HISTORICAL_YT_IDS;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw || '{}');
    _HISTORICAL_YT_IDS = new Set(Object.keys(data || {}));
    return _HISTORICAL_YT_IDS;
  } catch (err) {
    logger.warn('QueueService: failed to load historical_youtube.json; continuing without it', { err });
    _HISTORICAL_YT_IDS = new Set();
    return _HISTORICAL_YT_IDS;
  }
};

class QueueService {
  constructor(io, channelId) {
    this.db = null;
    this.io = io;
    this.channelId = channelId;
    this.currentlyPlaying = null;
    this.settings = new Map();
    this.cupRelationAvailable = true;
    this.lastTopEight = [];
    this.votingState = null;
    this.votingHistory = [];
  }

  async initialize() {
    this.db = getDatabase();
    await this.loadSettings();
    await this.cleanupOldItems();
    logger.info(`QueueService initialized for channel: ${this.channelId}`);
  }

  getVotingState() {
    if (!this.votingState) {
      return null;
    }
    return JSON.parse(JSON.stringify(this.votingState));
  }

  isVotingActive() {
    if (!this.votingState) {
      return false;
    }

    return ![VOTING_STAGES.COMPLETED, VOTING_STAGES.CANCELLED].includes(this.votingState.stage);
  }

  isVotingActiveForItem(queueItemId) {
    if (!this.votingState) {
      return false;
    }

    if (this.votingState.queueItemId !== queueItemId) {
      return false;
    }

    return this.isVotingActive();
  }

  _broadcastVotingState(reason = 'update') {
    if (!this.io) {
      return;
    }

    const payload = this.getVotingState();
    if (!payload) {
      this._broadcastVotingEnded(reason);
      return;
    }

    payload.lastEvent = reason;
    this.io.emit('voting:update', payload);
  }

  _broadcastVotingEnded(reason = 'ended') {
    if (!this.io) {
      return;
    }

    this.io.emit('voting:ended', {
      channelId: this.channelId,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  _touchVotingState(reason, details = {}) {
    if (!this.votingState) {
      return;
    }

    const timestamp = new Date().toISOString();
    this.votingState.updatedAt = timestamp;
    this.votingState.lastEvent = reason;

    if (!Array.isArray(this.votingState.history)) {
      this.votingState.history = [];
    }

    this.votingState.history.push({
      timestamp,
      reason,
      ...details
    });

    if (this.votingState.history.length > 100) {
      this.votingState.history = this.votingState.history.slice(-100);
    }
  }

  _deriveJudgeName({ session = null, score = null, fallback = 'Judge' } = {}) {
    const candidates = [
      session?.judgeName,
      session?.judge?.displayName,
      session?.judge?.username,
      score?.judgeName,
      score?.judge?.displayName,
      score?.judge?.username,
      fallback
    ];

    const resolved = candidates.find((value) => typeof value === 'string' && value.trim().length);
    return resolved ? resolved.trim() : fallback;
  }

  _deriveJudgeShortName(name) {
    if (!name || typeof name !== 'string') {
      return 'JG';
    }

    const trimmed = name.trim();
    if (!trimmed.length) {
      return 'JG';
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    const first = parts[0]?.[0] || '';
    const last = parts[parts.length - 1]?.[0] || '';
    const combined = `${first}${last}`.trim();
    return combined ? combined.toUpperCase() : trimmed.slice(0, 2).toUpperCase();
  }

  _ensureJudgeEntry(judgeId, defaults = {}) {
    if (!judgeId || !this.votingState) {
      return null;
    }

    if (!Array.isArray(this.votingState.judges)) {
      this.votingState.judges = [];
    }

    let entry = this.votingState.judges.find((judge) => judge.id === judgeId);
    if (!entry) {
      const order = this.votingState.judges.length;
      const name = defaults.name || `Judge ${order + 1}`;

      entry = {
        id: judgeId,
        name,
        shortName: defaults.shortName || this._deriveJudgeShortName(name),
        kind: defaults.kind || 'unknown',
        sessionId: defaults.sessionId || null,
        status: defaults.status || 'pending',
        score: defaults.score ?? null,
        scoreId: defaults.scoreId ?? null,
        locked: defaults.locked || false,
        lockType: defaults.lockType || null,
        lockedAt: defaults.lockedAt || null,
        updatedAt: defaults.updatedAt || this.votingState.startedAt,
        revealStatus: defaults.revealStatus || 'hidden',
        revealAt: defaults.revealAt || null,
        order,
        connected: defaults.connected ?? Boolean(defaults.sessionId),
        metadata: defaults.metadata || {}
      };

      this.votingState.judges.push(entry);
      return entry;
    }

    Object.entries(defaults).forEach(([key, value]) => {
      if (value !== undefined) {
        entry[key] = value;
      }
    });
    entry.updatedAt = defaults.updatedAt || new Date().toISOString();

    return entry;
  }

  async _calculateSocialBaseline(cupId) {
    try {
      const aggregate = await this.db.judgeScore.aggregate({
        where: { cupId },
        _avg: { score: true },
        _count: { score: true }
      });

      const meanScore = Number(
        (aggregate?._avg?.score ?? DEFAULT_SOCIAL_GLOBAL_MEAN).toFixed(5)
      );
      const totalVotes = aggregate?._count?.score ?? 0;

      return {
        meanScore,
        totalVotes,
        minimumVotes: DEFAULT_SOCIAL_MIN_VOTES
      };
    } catch (error) {
      logger.warn('Failed to calculate social baseline', { channelId: this.channelId, cupId, error });
      return {
        meanScore: DEFAULT_SOCIAL_GLOBAL_MEAN,
        totalVotes: 0,
        minimumVotes: DEFAULT_SOCIAL_MIN_VOTES
      };
    }
  }

  _recalculateVotingAggregates() {
    if (!this.votingState || !Array.isArray(this.votingState.judges)) {
      return;
    }

    const scores = [];
    let lockedCount = 0;

    this.votingState.judges.forEach((judge, index) => {
      judge.order = index;
      if (typeof judge.score === 'number') {
        scores.push(Number(judge.score));
      }
      if (judge.locked) {
        lockedCount += 1;
      }
    });

    const total = scores.reduce((sum, value) => sum + value, 0);
    const count = scores.length;
    const average = count > 0 ? Number((total / count).toFixed(5)) : null;

    this.votingState.metrics = {
      totalJudges: this.votingState.judges.length,
      submitted: count,
      locked: lockedCount
    };

    this.votingState.computedTotal = count > 0 ? Number(total.toFixed(5)) : null;
    this.votingState.computedAverage = average;

    this._recalculateComputedSocial();
  }

  _recalculateComputedSocial() {
    if (!this.votingState) {
      return;
    }

    const baseline = this.votingState.socialBaseline || {};
    const submitted = this.votingState.metrics?.submitted ?? 0;
    const minimumVotes = Math.max(baseline.minimumVotes || DEFAULT_SOCIAL_MIN_VOTES, 1);
    const globalMean = typeof baseline.meanScore === 'number'
      ? baseline.meanScore
      : DEFAULT_SOCIAL_GLOBAL_MEAN;
    const average = this.votingState.computedAverage;

    this.votingState.socialBreakdown = {
      v: submitted,
      m: minimumVotes,
      C: globalMean
    };

    if (typeof average !== 'number') {
      this.votingState.computedSocial = null;
      return;
    }

    const divisor = submitted + minimumVotes;
    if (divisor <= 0) {
      this.votingState.computedSocial = null;
      return;
    }

    const weighted = ((submitted / divisor) * average) + ((minimumVotes / divisor) * globalMean);
    this.votingState.computedSocial = Number(weighted.toFixed(5));
  }

  async startVoting(queueItemId, options = {}) {
    if (this.isVotingActive() && this.votingState?.queueItemId !== queueItemId) {
      throw new Error('Another voting session is already in progress');
    }

    if (!Number.isInteger(queueItemId)) {
      throw new Error('Queue item ID must be an integer');
    }

    const queueItem = await this.db.queueItem.findFirst({
      where: {
        id: queueItemId,
        channelId: this.channelId
      },
      include: {
        submitter: {
          select: SUBMITTER_SELECT
        },
        cup: {
          select: CUP_INCLUDE_SELECTION
        }
      }
    });

    if (!queueItem) {
      throw new Error('Queue item not found');
    }

    if (!queueItem.cupId) {
      throw new Error('Queue item is not assigned to a cup');
    }

    const [sessions, scores, socialBaseline] = await Promise.all([
      this.db.judgeSession.findMany({
        where: {
          cupId: queueItem.cupId,
          status: 'ACTIVE'
        },
        include: {
          judge: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        }
      }),
      this.db.judgeScore.findMany({
        where: {
          cupId: queueItem.cupId,
          queueItemId
        },
        include: {
          judge: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        }
      }),
      this._calculateSocialBaseline(queueItem.cupId)
    ]);

    const startedAt = new Date().toISOString();

    // Determine duplicate baseline (from DB history only; file has no score)
    let duplicateAverageToBeat = null;
    let duplicateJudgeCount = 0;
    let duplicateHasHistory = false;
    try {
      const dup = await this.getDuplicateInfo(queueItem.videoId);
      if (dup?.previousItem) {
        duplicateHasHistory = true;
        if (typeof dup.previousItem.averageScore === 'number') {
          duplicateAverageToBeat = Number(dup.previousItem.averageScore);
        }
        duplicateJudgeCount = dup.previousItem.judgeCount || 0;
      }
    } catch (e) {
      // non-fatal
    }

    this.votingState = {
      channelId: this.channelId,
      queueItemId,
      cupId: queueItem.cupId,
      cup: queueItem.cup
        ? {
            id: queueItem.cup.id,
            title: queueItem.cup.title,
            theme: queueItem.cup.theme,
            status: queueItem.cup.status
          }
        : null,
      queueItem: {
        id: queueItem.id,
        title: queueItem.title,
        videoId: queueItem.videoId,
        duration: queueItem.duration,
        position: queueItem.position,
        thumbnailUrl: queueItem.thumbnailUrl,
        submitterAlias: queueItem.submitterAlias || null,
        submitterUsername: queueItem.submitter?.twitchUsername || queueItem.submitterUsername || null
      },
      stage: VOTING_STAGES.COLLECTING,
      revealIndex: -1,
      initiatedBy: options.initiatedBy || 'producer',
      startedAt,
      updatedAt: startedAt,
      lastEvent: 'start',
      history: [],
      judges: [],
      metrics: {
        totalJudges: 0,
        submitted: 0,
        locked: 0
      },
      computedAverage: null,
      computedTotal: null,
      computedSocial: null,
      socialBaseline,
      socialBreakdown: null,
      revealedAverage: null,
      revealedAverageAt: null,
      revealedSocial: null,
      revealedSocialAt: null,
      duplicate: {
        hasHistory: duplicateHasHistory,
        averageToBeat: duplicateAverageToBeat,
        judgeCount: duplicateJudgeCount
      }
    };

    // Seed judges based on active sessions
    sessions.forEach((session) => {
      const judgeId = session.judgeAccountId || session.judgeTokenId;
      if (!judgeId) {
        return;
      }

      const name = this._deriveJudgeName({ session });
      this._ensureJudgeEntry(judgeId, {
        name,
        shortName: this._deriveJudgeShortName(name),
        kind: session.judgeAccountId ? 'account' : 'token',
        sessionId: session.id,
        connected: session.status === 'ACTIVE',
        status: 'pending'
      });
    });

    // Merge existing scores (if any) so that reconnection picks up progress
    scores.forEach((score) => {
      const judgeId = score.judgeAccountId || score.judgeTokenId;
      if (!judgeId) {
        return;
      }

      const name = this._deriveJudgeName({ score });
      const locked = Boolean(score.isLocked);
      const status = locked ? 'locked' : 'scored';

      const entry = this._ensureJudgeEntry(judgeId, {
        name,
        shortName: this._deriveJudgeShortName(name),
        kind: score.judgeAccountId ? 'account' : 'token',
        score: Number(score.score),
        scoreId: score.id,
        locked,
        lockType: score.lockType || null,
        lockedAt: score.lockedAt ? new Date(score.lockedAt).toISOString() : null,
        status
      });

      if (entry) {
        entry.score = Number(score.score);
        entry.scoreId = score.id;
        entry.locked = locked;
        entry.lockType = score.lockType || null;
        entry.lockedAt = score.lockedAt ? new Date(score.lockedAt).toISOString() : null;
        entry.status = status;
      }
    });

    this._recalculateVotingAggregates();
    this._touchVotingState('start', {
      queueItemId,
      initiatedBy: options.initiatedBy || 'producer',
      judgeCount: this.votingState.judges.length
    });
    this._broadcastVotingState('start');

    return this.getVotingState();
  }

  cancelVoting(options = {}) {
    if (!this.votingState) {
      return null;
    }

    const reason = options.reason || 'cancelled';
    const initiatedBy = options.initiatedBy || 'producer';
    const timestamp = new Date().toISOString();

    this.votingState.stage = VOTING_STAGES.CANCELLED;
    this.votingState.endedAt = timestamp;
    this.votingState.endReason = reason;

    this._touchVotingState('cancelled', { reason, initiatedBy });
    const snapshot = this.getVotingState();

    this._broadcastVotingState('cancelled');
    this.votingHistory.push(snapshot);
    this.votingState = null;
    this._broadcastVotingEnded(reason);

    return snapshot;
  }

  advanceJudgeReveal() {
    if (!this.votingState) {
      throw new Error('No voting session in progress');
    }

    const judges = Array.isArray(this.votingState.judges) ? this.votingState.judges : [];
    const findNextIndex = () =>
      judges.findIndex((entry) => !['revealed', 'skipped'].includes(entry.revealStatus));

    let nextIndex = findNextIndex();
    if (nextIndex === -1) {
      throw new Error('All judges have already been revealed');
    }

    let skippedAny = false;
    while (nextIndex !== -1) {
      const judge = judges[nextIndex];
      const hasScore = typeof judge.score === 'number';
      const isLocked = Boolean(judge.locked);

      if (hasScore && isLocked) {
        const revealAt = new Date().toISOString();
        judge.revealStatus = 'revealed';
        judge.revealAt = revealAt;
        judge.status = 'revealed';
        this.votingState.revealIndex = nextIndex;
        this.votingState.stage = VOTING_STAGES.REVEALING;

        this._touchVotingState('reveal-judge', { judgeId: judge.id, order: judge.order });
        this._broadcastVotingState('reveal-judge');

        return this.getVotingState();
      }

      const skipReason = hasScore ? 'not_locked' : 'no_score';
      const timestamp = new Date().toISOString();

      judge.revealStatus = 'skipped';
      judge.revealAt = timestamp;
      judge.status = 'excluded';
      judge.skipped = true;
      judge.skippedReason = skipReason;

      if (hasScore) {
        judge.score = null;
      }
      judge.scoreId = null;
      judge.locked = false;
      judge.lockType = null;
      judge.lockedAt = null;

      skippedAny = true;
      this._recalculateVotingAggregates();
      this._touchVotingState('judge-skipped', { judgeId: judge.id, reason: skipReason });
      this._broadcastVotingState('judge-skipped');

      nextIndex = findNextIndex();
    }

    if (skippedAny) {
      this.votingState.revealIndex = -1;
      return this.getVotingState();
    }

    throw new Error('No judges available to reveal');
  }

  revealAverage() {
    if (!this.votingState) {
      throw new Error('No voting session in progress');
    }

    const unrevealed = this.votingState.judges.filter(
      (judge) => typeof judge.score === 'number' && judge.revealStatus !== 'revealed'
    );

    if (unrevealed.length > 0) {
      throw new Error('All judges must be revealed before showing the average');
    }

    if (typeof this.votingState.computedAverage !== 'number') {
      throw new Error('Average score is not available yet');
    }

    let average = this.votingState.computedAverage;

    // If duplicate with a known baseline, show 0 unless strictly greater
    try {
      const avgToBeat = this.votingState?.duplicate?.averageToBeat;
      if (typeof avgToBeat === 'number') {
        if (!(average > avgToBeat)) {
          average = 0;
        }
      }
    } catch (_) {
      // ignore
    }

    this.votingState.revealedAverage = average;
    this.votingState.revealedAverageAt = new Date().toISOString();
    this.votingState.stage = VOTING_STAGES.AVERAGE;

    this._touchVotingState('reveal-average', { average });
    this._broadcastVotingState('reveal-average');

    return this.getVotingState();
  }

  revealSocialScore() {
    if (!this.votingState) {
      throw new Error('No voting session in progress');
    }

    if (!this.votingState.revealedAverage) {
      throw new Error('Average must be revealed before calculating social score');
    }

    if (typeof this.votingState.computedSocial !== 'number') {
      throw new Error('Social score cannot be calculated yet');
    }

    let social = this.votingState.computedSocial;

    // If duplicate with a known baseline, zero social unless average beats prior
    try {
      const avgToBeat = this.votingState?.duplicate?.averageToBeat;
      const avgNow = this.votingState?.computedAverage;
      if (typeof avgToBeat === 'number' && typeof avgNow === 'number') {
        if (!(avgNow > avgToBeat)) {
          social = 0;
        }
      }
    } catch (_) {
      // ignore errors, keep computed social
    }

    this.votingState.revealedSocial = social;
    this.votingState.revealedSocialAt = new Date().toISOString();
    this.votingState.stage = VOTING_STAGES.SOCIAL;

    this._touchVotingState('reveal-social', {
      social,
      breakdown: this.votingState.socialBreakdown
    });
    this._broadcastVotingState('reveal-social');

    return this.getVotingState();
  }

  completeVoting(options = {}) {
    if (!this.votingState) {
      return null;
    }

    const timestamp = new Date().toISOString();

    if (!this.votingState.revealedAverage && typeof this.votingState.computedAverage === 'number') {
      this.votingState.revealedAverage = this.votingState.computedAverage;
      this.votingState.revealedAverageAt = timestamp;
    }

    if (!this.votingState.revealedSocial && typeof this.votingState.computedSocial === 'number') {
      this.votingState.revealedSocial = this.votingState.computedSocial;
      this.votingState.revealedSocialAt = timestamp;
    }

    this.votingState.stage = VOTING_STAGES.COMPLETED;
    this.votingState.completedAt = timestamp;
    this.votingState.endReason = options.reason || 'finalized';

    if (options.finalAverage) {
      this.votingState.finalAverage = options.finalAverage;
    }

    if (options.finalVideo) {
      this.votingState.finalVideo = options.finalVideo;
    }

    this._touchVotingState('completed', {
      reason: this.votingState.endReason,
      finalAverage: this.votingState.revealedAverage,
      finalSocial: this.votingState.revealedSocial
    });

    const snapshot = this.getVotingState();
    this.votingHistory.push(snapshot);

    this._broadcastVotingState('completed');
    return snapshot;
  }

  handleJudgeScoreEvent(event, payload = {}) {
    if (!this.votingState) {
      return;
    }

    const judgeScore = payload.judgeScore || null;
    const queueItemId = judgeScore?.queueItemId ?? payload.queueItemId ?? null;

    if (queueItemId !== this.votingState.queueItemId) {
      return;
    }

    if (event === 'all_votes_locked') {
      const timestamp = new Date().toISOString();
      this.votingState.judges.forEach((judge) => {
        if (typeof judge.score === 'number') {
          judge.locked = true;
          judge.lockType = 'FORCED';
          judge.status = 'locked';
          judge.lockedAt = timestamp;
        }
      });

      this._recalculateVotingAggregates();
      this._touchVotingState('all_votes_locked', { count: payload.count || 0 });
      this._broadcastVotingState('all_votes_locked');
      return;
    }

    if (event === 'all_forced_locks_removed') {
      this.votingState.judges.forEach((judge) => {
        if (judge.lockType === 'FORCED') {
          judge.locked = false;
          judge.lockType = null;
          judge.status = typeof judge.score === 'number' ? 'scored' : 'pending';
          judge.lockedAt = null;
        }
      });

      this._recalculateVotingAggregates();
      this._touchVotingState('all_forced_locks_removed', { count: payload.count || 0 });
      this._broadcastVotingState('all_forced_locks_removed');
      return;
    }

    if (!judgeScore) {
      return;
    }

    const judgeId = judgeScore.judgeAccountId || judgeScore.judgeTokenId;
    if (!judgeId) {
      return;
    }

    const name = this._deriveJudgeName({ score: judgeScore });
    const locked = Boolean(judgeScore.isLocked);
    const status = locked ? 'locked' : 'scored';
    const timestamp = new Date().toISOString();

    const entry = this._ensureJudgeEntry(judgeId, {
      name,
      shortName: this._deriveJudgeShortName(name),
      kind: judgeScore.judgeAccountId ? 'account' : 'token',
      score: Number(judgeScore.score),
      scoreId: judgeScore.id,
      locked,
      lockType: judgeScore.lockType || null,
      lockedAt: judgeScore.lockedAt ? new Date(judgeScore.lockedAt).toISOString() : locked ? timestamp : null,
      status,
      connected: true
    });

    if (!entry) {
      return;
    }

    if (typeof judgeScore.score === 'number') {
      entry.score = Number(judgeScore.score);
      entry.status = status;
    }

    entry.scoreId = judgeScore.id;
    entry.locked = locked;
    entry.lockType = judgeScore.lockType || null;
    entry.lockedAt = judgeScore.lockedAt ? new Date(judgeScore.lockedAt).toISOString() : (locked ? timestamp : null);

    if (event === 'vote_unlocked') {
      entry.locked = false;
      entry.lockType = null;
      entry.lockedAt = null;
      entry.status = typeof entry.score === 'number' ? 'scored' : 'pending';
    }

    this._recalculateVotingAggregates();
    this._touchVotingState(`judge-${event}`, { judgeId: entry.id });
    this._broadcastVotingState(`judge-${event}`);
  }

  handleJudgeSessionEvent(event, payload = {}) {
    if (!this.votingState) {
      return;
    }

    const session = payload.session || null;
    if (!session || session.cupId !== this.votingState.cupId) {
      return;
    }

    const judgeId = session.judgeAccountId || session.judgeTokenId;
    if (!judgeId) {
      return;
    }

    const name = this._deriveJudgeName({ session });
    const entry = this._ensureJudgeEntry(judgeId, {
      name,
      shortName: this._deriveJudgeShortName(name),
      kind: session.judgeAccountId ? 'account' : 'token',
      sessionId: session.id,
      connected: event !== 'session_ended'
    });

    if (!entry) {
      return;
    }

    if (event === 'session_ended') {
      entry.connected = false;
      if (entry.status === 'pending') {
        entry.status = 'offline';
      }
    }

    if (event === 'name_updated') {
      entry.name = name;
      entry.shortName = this._deriveJudgeShortName(name);
    }

    this._touchVotingState(`judge-${event}`, { judgeId });
    this._broadcastVotingState(`judge-${event}`);
  }

  async loadSettings() {
    try {
      const settings = await this.db.botSetting.findMany({
        where: { channelId: this.channelId }
      });
      settings.forEach(setting => {
        this.settings.set(setting.key, setting.value);
      });
      logger.info(`Bot settings loaded for channel: ${this.channelId}`);
    } catch (error) {
      logger.error(`Failed to load settings for channel ${this.channelId}:`, error);
      throw error;
    }
  }

  async getSetting(key, defaultValue = null) {
    if (this.settings.has(key)) {
      return this.settings.get(key);
    }
    return defaultValue;
  }

  async updateSetting(key, value) {
    try {
      await this.db.botSetting.upsert({
        where: { 
          channelId_key: {
            channelId: this.channelId,
            key: key
          }
        },
        update: { value: value.toString() },
        create: { 
          channelId: this.channelId,
          key: key, 
          value: value.toString() 
        }
      });
      
      this.settings.set(key, value.toString());
      this.io.emit('setting:updated', { key, value });
      logger.info(`Setting updated for channel ${this.channelId}: ${key} = ${value}`);
    } catch (error) {
      logger.error(`Failed to update setting ${key} for channel ${this.channelId}:`, error);
      throw error;
    }
  }

  async isQueueEnabled() {
    const enabled = await this.getSetting('queue_enabled', 'false');
    return enabled === 'true';
  }

  async enableQueue(enabled = true) {
    await this.updateSetting('queue_enabled', enabled);
    this.io.emit('queue:status_changed', { enabled });
    logger.info(`Queue ${enabled ? 'enabled' : 'disabled'}`);
  }

  async addToQueue(videoData, submitter, options = {}) {
    try {
      // Check if queue is enabled
      if (!(await this.isQueueEnabled())) {
        throw new Error('Queue is currently disabled');
      }

      // Check queue size limit
      const rawMaxSize = parseInt(await this.getSetting('max_queue_size', '0'), 10);
      const maxSize = Number.isNaN(rawMaxSize) || rawMaxSize <= 0 ? Infinity : rawMaxSize;
      const currentSize = await this.getQueueSize();
      
      if (currentSize >= maxSize) {
        throw new Error(`Queue is full (max ${maxSize} items)`);
      }

      const maxPerUserSetting = parseInt(await this.getSetting('max_per_user', '3'), 10);
      if (!Number.isNaN(maxPerUserSetting) && maxPerUserSetting > 0) {
        const activeForUser = await this.db.queueItem.count({
          where: {
            channelId: this.channelId,
            submitterUsername: submitter,
            status: { in: ACTIVE_QUEUE_STATUSES }
          }
        });

        if (activeForUser >= maxPerUserSetting) {
          throw new Error(`You already have ${maxPerUserSetting} video${maxPerUserSetting === 1 ? '' : 's'} in the queue.`);
        }
      }

      const duplicateInfo = await this.getDuplicateInfo(videoData.videoId);

      if (duplicateInfo.activeItem) {
        throw new Error('This video is already in the queue');
      }

      // Check user cooldown
      await this.checkSubmissionCooldown(submitter);

      // Get next position
      const nextPosition = await this.getNextPosition();

      // Create user if not exists (scoped to this channel)
      await this.db.user.upsert({
        where: { 
          twitchUsername_channelId: {
            twitchUsername: submitter,
            channelId: this.channelId
          }
        },
        update: { 
          submissionCount: { increment: 1 },
          lastSubmission: new Date()
        },
        create: { 
          twitchUsername: submitter,
          channelId: this.channelId,
          submissionCount: 1,
          lastSubmission: new Date()
        }
      });

      // Generate a unique alias for this specific video submission
      const randomAlias = await this._generateUniqueAlias();

      // Find active cup for auto-assignment
      const activeCup = await this.db.cup.findFirst({
        where: {
          channelId: this.channelId,
          isActive: true,
          status: 'LIVE'
        }
      });

      // Add to queue
      const initialStatus = options.initialStatus || 'APPROVED';

      const queueItem = await this.db.queueItem.create({
        data: {
          channelId: this.channelId,
          videoUrl: videoData.url,
          videoId: videoData.videoId,
          platform: videoData.platform,
          title: videoData.title,
          thumbnailUrl: videoData.thumbnail,
          duration: videoData.duration,
          submitterUsername: submitter,
          submitterAlias: randomAlias,
          position: nextPosition,
          status: initialStatus,
          cupId: activeCup?.id // Auto-assign to active cup if one exists
        },
        include: {
          submitter: {
            select: SUBMITTER_SELECT
          },
          cup: true
        }
      });

      const hydratedItem = await this._hydrateQueueItem(queueItem);

      // Log submission
      await this.logSubmission(submitter, 'ADD_VIDEO', {
        videoId: videoData.videoId,
        title: videoData.title,
        platform: videoData.platform
      });

      // Emit to all clients
      this.io.emit('queue:video_added', hydratedItem);

      logger.info(`Video added to queue: ${videoData.title} by ${submitter}`);
      const warnings = [];
      if (duplicateInfo.previousItem) {
        const { averageScore, judgeCount, playedAt } = duplicateInfo.previousItem;
        const formattedScore = averageScore !== null ? Number(averageScore).toFixed(2) : null;
        const judgeText = judgeCount ? ` by ${judgeCount} judge${judgeCount === 1 ? '' : 's'}` : '';
        const playedText = playedAt ? ` on ${playedAt.toISOString().split('T')[0]}` : '';
        warnings.push({
          type: 'DUPLICATE_HISTORY',
          message: `Previously scored${formattedScore ? ` ${formattedScore}` : ''}${judgeText}${playedText}.`,
          details: duplicateInfo.previousItem
        });
      }

      return {
        queueItem: hydratedItem,
        duplicate: duplicateInfo.previousItem,
        warnings
      };
    } catch (error) {
      logger.error('Failed to add video to queue:', error);
      throw error;
    }
  }

  async removeFromQueue(itemId, removedBy = 'system') {
    try {
      const item = await this.db.queueItem.findUnique({
        where: { id: itemId },
        include: { submitter: true }
      });

      if (!item) {
        throw new Error('Queue item not found');
      }

      // Update item status
      await this.db.queueItem.update({
        where: { id: itemId },
        data: {
          status: 'REMOVED',
          playedAt: new Date()
        }
      });
      // Ensure VIP list is updated
      try {
        await this._removeVipEntry(itemId);
      } catch (err) {
        logger.warn('Failed to remove VIP entry during removeFromQueue', { channelId: this.channelId, itemId, error: err });
      }

      // Reorder remaining items
      await this.reorderQueue();

      // Log removal
      await this.logSubmission(removedBy, 'REMOVE_VIDEO', {
        videoId: item.videoId,
        title: item.title,
        originalSubmitter: item.submitterUsername
      });

      // Emit to all clients
      this.io.emit('queue:video_removed', { id: itemId });

      // Remove from VIP list if present
      try {
        await this._removeVipEntry(itemId);
      } catch (err) {
        logger.warn('Failed to remove VIP entry during markAsPlayed', { channelId: this.channelId, itemId, error: err });
      }

      logger.info(`Video removed from queue: ${item.title} by ${removedBy}`);
      return true;
    } catch (error) {
      logger.error('Failed to remove video from queue:', error);
      throw error;
    }
  }

  async getCurrentQueue() {
    try {
      const baseInclude = {
        submitter: {
          select: SUBMITTER_SELECT
        }
      };

      const query = {
        where: {
          channelId: this.channelId,
          status: { in: ACTIVE_QUEUE_STATUSES }
        },
        include: this._withCupInclude(baseInclude),
        orderBy: { position: 'asc' }
      };

      let items;
      try {
        items = await this.db.queueItem.findMany(query);
      } catch (error) {
        if (this._handleCupIncludeFailure(error)) {
          items = await this.db.queueItem.findMany({
            ...query,
            include: baseInclude
          });
        } else {
          throw error;
        }
      }

      if (!items) {
        items = await this.db.queueItem.findMany(query);
      }

      const hydrated = await this._hydrateQueueItems(items);

      // Place VIP items at the front in FIFO order if any
      try {
        const vipList = await this._getVipList();
        if (Array.isArray(vipList) && vipList.length) {
          const vipIndexMap = new Map(vipList.map((id, idx) => [id, idx]));
          hydrated.sort((a, b) => {
            const aVip = vipIndexMap.has(a.id) ? vipIndexMap.get(a.id) : -1;
            const bVip = vipIndexMap.has(b.id) ? vipIndexMap.get(b.id) : -1;
            if (aVip !== -1 || bVip !== -1) {
              if (aVip === -1) return 1;
              if (bVip === -1) return -1;
              return aVip - bVip;
            }
            // fallback to normal position ordering
            return (a.position || 0) - (b.position || 0);
          });
        }
      } catch (err) {
        logger.warn('Failed to sort VIPs in current queue', { channelId: this.channelId, error: err });
      }

      return hydrated;
    } catch (error) {
      logger.error('Failed to get current queue:', error);
      throw error;
    }
  }

  async getNextVideo() {
    try {
      // VIP handling: if there are any VIP items queued, return the first active VIP (FIFO)
      try {
        const vipList = await this._getVipList();
        if (Array.isArray(vipList) && vipList.length) {
          for (const vipId of vipList) {
            if (!Number.isInteger(Number(vipId))) continue;
            const baseInclude = {
              submitter: {
                select: SUBMITTER_SELECT
              }
            };

            let vipItem = null;
            try {
              vipItem = await this.db.queueItem.findUnique({
                where: { id: Number(vipId) },
                include: this._withCupInclude(baseInclude)
              });
            } catch (err) {
              if (this._handleCupIncludeFailure(err)) {
                vipItem = await this.db.queueItem.findUnique({
                  where: { id: Number(vipId) },
                  include: baseInclude
                });
              } else {
                throw err;
              }
            }

            if (vipItem && ORDERABLE_QUEUE_STATUSES.includes(vipItem.status)) {
              return await this._hydrateQueueItem(vipItem);
            }
          }
        }
      } catch (vipErr) {
        // Non-fatal: continue to normal queue selection if VIP check fails
        logger.warn('VIP queue check failed, falling back to normal queue', { channelId: this.channelId, error: vipErr });
      }
      const baseInclude = {
        submitter: {
          select: SUBMITTER_SELECT
        }
      };

      const query = {
        where: { 
          channelId: this.channelId,
          status: { in: ORDERABLE_QUEUE_STATUSES }
        },
        include: this._withCupInclude(baseInclude),
        orderBy: [
          { position: 'asc' }
        ]
      };

      let item;
      try {
        item = await this.db.queueItem.findFirst(query);
      } catch (error) {
        if (this._handleCupIncludeFailure(error)) {
          item = await this.db.queueItem.findFirst({
            ...query,
            include: baseInclude
          });
        } else {
          throw error;
        }
      }

      if (!item) {
        return null;
      }

      const hydrated = await this._hydrateQueueItem(item);
      try {
        // Tag duplicate history for judge visibility
        const info = await this.getDuplicateInfo(hydrated.videoId);
        let hasHistory = Boolean(info?.previousItem);
        if (!hasHistory) {
          const set = await _loadHistoricalYouTubeIds();
          hasHistory = set.has(hydrated.videoId);
        }
        if (hasHistory) {
          hydrated.hasDuplicateHistory = true;
        }
      } catch (e) {
        // non-fatal
      }
      return hydrated;
    } catch (error) {
      logger.error('Failed to get next video:', error);
      throw error;
    }
  }

  async playNext(options = {}) {
    try {
      const {
        finalizeCurrent = false,
        finalizeStatus = 'PLAYED',
        initiatedBy = 'system'
      } = options;
      let removalOccurred = false;

      if (finalizeCurrent && this.currentlyPlaying?.id) {
        const currentId = this.currentlyPlaying.id;
        try {
          const existing = await this.db.queueItem.findUnique({
            where: { id: currentId },
            select: {
              status: true,
              videoId: true,
              title: true,
              submitterUsername: true,
              playedAt: true
            }
          });

          if (existing && !TERMINAL_QUEUE_STATUSES.includes(existing.status)) {
            if (this.votingState?.queueItemId === currentId) {
              this.cancelVoting({
                reason: 'auto-advanced',
                initiatedBy
              });
            }

            await this.db.queueItem.update({
              where: { id: currentId },
              data: {
                status: finalizeStatus,
                playedAt: existing.playedAt || new Date()
              }
            });

            this.io.emit('queue:video_removed', { id: currentId });
            removalOccurred = true;

            logger.info(
              `Finalized current video "${existing.title || existing.videoId}" as ${finalizeStatus} before advancing`
            );
          }
        } catch (finalizeError) {
          logger.error('Failed to finalize current video before advancing:', finalizeError);
        } finally {
          this.currentlyPlaying = null;
        }
      }

      const nextVideo = await this.getNextVideo();
      
      if (!nextVideo) {
        this.currentlyPlaying = null;
        this.io.emit('queue:now_playing', null);
        if (removalOccurred) {
          await this.reorderQueue();
        }
        return null;
      }

      // Mark current video as playing
      // If this was a VIP item, remove it from the VIP queue (it is now playing)
      try {
        await this._removeVipEntry(nextVideo.id);
      } catch (err) {
        logger.warn('Failed to remove VIP entry when advancing to play next', { channelId: this.channelId, itemId: nextVideo.id, error: err });
      }
      await this.db.queueItem.update({
        where: { id: nextVideo.id },
        data: {
          status: 'PLAYING',
          playedAt: new Date()
        }
      });

      this.currentlyPlaying = nextVideo;
      this.io.emit('queue:now_playing', nextVideo);

      logger.info(`Now playing: ${nextVideo.title}`);
      if (removalOccurred) {
        await this.reorderQueue();
      }
      return nextVideo;
    } catch (error) {
      logger.error('Failed to play next video:', error);
      throw error;
    }
  }

  async skipCurrent(skippedBy = 'system') {
    try {
      if (!this.currentlyPlaying) {
        throw new Error('No video currently playing');
      }

      const skippedItem = this.currentlyPlaying;

      if (this.votingState?.queueItemId === skippedItem.id) {
        this.cancelVoting({
          reason: 'skipped',
          initiatedBy: skippedBy
        });
      }

      // Mark as skipped
      await this.db.queueItem.update({
        where: { id: skippedItem.id },
        data: {
          status: 'SKIPPED',
          playedAt: new Date()
        }
      });

      // Remove from VIP list if present
      try {
        await this._removeVipEntry(skippedItem.id);
      } catch (err) {
        logger.warn('Failed to remove VIP entry during skipCurrent', { channelId: this.channelId, itemId: skippedItem.id, error: err });
      }

      // Log skip
      await this.logSubmission(skippedBy, 'SKIP_VIDEO', {
        videoId: skippedItem.videoId,
        title: skippedItem.title
      });

      // Play next video
      const nextVideo = await this.playNext();

      await this.reorderQueue();
      this.io.emit('queue:video_removed', { id: skippedItem.id });

      logger.info(`Video skipped: ${skippedItem.title} by ${skippedBy}`);
      return nextVideo;
    } catch (error) {
      logger.error('Failed to skip current video:', error);
      throw error;
    }
  }

  async markAsPlayed(itemId) {
    try {
      await this.db.queueItem.update({
        where: { id: itemId },
        data: { status: 'PLAYED' }
      });

      this.io.emit('queue:video_removed', { id: itemId });

      // Auto-play next if enabled
      const autoPlay = await this.getSetting('auto_play_next', 'true');
      if (autoPlay === 'true') {
        await this.playNext();
      } else {
        this.currentlyPlaying = null;
        this.io.emit('queue:now_playing', null);
      }

      await this.reorderQueue();

      logger.info(`Video marked as played: ${itemId}`);
    } catch (error) {
      logger.error('Failed to mark video as played:', error);
      throw error;
    }
  }

  async clearQueue(clearedBy = 'system') {
    try {
      if (this.votingState) {
        this.cancelVoting({
          reason: 'queue_cleared',
          initiatedBy: clearedBy
        });
      }

      await this.db.queueItem.updateMany({
        where: {
          channelId: this.channelId,
          status: { in: ACTIVE_QUEUE_STATUSES }
        },
        data: { status: 'REMOVED' }
      });

      this.currentlyPlaying = null;

      // Log clear
      await this.logSubmission(clearedBy, 'CLEAR_QUEUE', {});

      // Emit to all clients
      this.io.emit('queue:cleared');

      logger.info(`Queue cleared by ${clearedBy}`);
    } catch (error) {
      logger.error('Failed to clear queue:', error);
      throw error;
    }
  }

  async triggerShuffle(initiatedBy = 'system', options = {}) {
    try {
      const normalizedInitiator = initiatedBy || 'system';
      const providedTopEightIds = Array.isArray(options.topEightIds)
        ? options.topEightIds
            .map((id) => parseInt(id, 10))
            .filter((id) => Number.isInteger(id))
        : [];

      const baseInclude = {
        submitter: {
          select: SUBMITTER_SELECT
        }
      };

      const query = {
        where: {
          channelId: this.channelId,
          status: {
            in: ['TOP_EIGHT', 'APPROVED', 'PENDING']
          }
        },
        orderBy: { position: 'asc' },
        include: this._withCupInclude(baseInclude)
      };

      let candidateItems;
      try {
        candidateItems = await this.db.queueItem.findMany(query);
      } catch (error) {
        if (this._handleCupIncludeFailure(error)) {
          candidateItems = await this.db.queueItem.findMany({
            ...query,
            include: baseInclude
          });
        } else {
          throw error;
        }
      }

      if (!candidateItems.length) {
        throw new Error('No videos available to shuffle');
      }

      candidateItems = await this._hydrateQueueItems(candidateItems);

      // Exclude VIP items from shuffle so they remain FIFO and unaffected
      try {
        const vipList = await this._getVipList();
        if (Array.isArray(vipList) && vipList.length) {
          const vipSet = new Set(vipList.map((v) => Number(v)));
          candidateItems = candidateItems.filter((item) => !vipSet.has(item.id));
        }
      } catch (err) {
        logger.warn('Failed to filter VIPs from shuffle candidate list', { channelId: this.channelId, error: err });
      }

      const candidateMap = new Map(candidateItems.map((item) => [item.id, item]));
      let selectedItems = [];

      const targetCount = Math.min(8, candidateItems.length);

      if (providedTopEightIds.length) {
        const seenIds = new Set();

        providedTopEightIds.forEach((id) => {
          const candidate = candidateMap.get(id);
          if (!candidate) {
            throw new Error(`Queue item ${id} is not available for shuffle`);
          }
          if (seenIds.has(candidate.id)) {
            return;
          }
          selectedItems.push(candidate);
          seenIds.add(candidate.id);
        });

        if (!selectedItems.length) {
          throw new Error('Not enough videos to select a Top 8');
        }

        if (selectedItems.length < targetCount) {
          // Backfill any remaining slots with the highest priority queue items
          for (let i = 0; i < candidateItems.length && selectedItems.length < targetCount; i += 1) {
            const candidate = candidateItems[i];
            if (!seenIds.has(candidate.id)) {
              selectedItems.push(candidate);
              seenIds.add(candidate.id);
            }
          }
        }
      } else {
        selectedItems = candidateItems.slice(0, targetCount);
      }

      if (!selectedItems.length) {
        throw new Error('Not enough videos to select a Top 8');
      }

      const seed = Number.isFinite(options.seed) ? Number(options.seed) : Date.now();

      const initialOrder = selectedItems.map((item, index) =>
        this._formatBroadcastItem(item, index + 1)
      );

      const shuffledItems = shuffleWithSeed(selectedItems, seed);
      const finalOrder = shuffledItems.map((item, index) =>
        this._formatBroadcastItem(item, index + 1)
      );

      const selectedIdSet = new Set(finalOrder.map((item) => item.id));

      await this.db.queueItem.updateMany({
        where: {
          channelId: this.channelId,
          status: 'TOP_EIGHT',
          id: { notIn: Array.from(selectedIdSet) }
        },
        data: { status: 'APPROVED' }
      });

      await this.db.queueItem.updateMany({
        where: {
          channelId: this.channelId,
          id: { in: Array.from(selectedIdSet) }
        },
        data: { status: 'TOP_EIGHT' }
      });

      const remainingItems = candidateItems.filter((item) => !selectedIdSet.has(item.id));
      await this.reorderQueue([...shuffledItems, ...remainingItems]);

      const payload = {
        channelId: this.channelId,
        initiatedBy: normalizedInitiator,
        seed,
        timestamp: new Date().toISOString(),
        initialOrder,
        finalOrder,
        count: finalOrder.length
      };

      this.lastTopEight = finalOrder;

      this.io.emit('queue:shuffle', payload);
      this.io.emit('queue:top_eight_updated', {
        channelId: this.channelId,
        topEight: finalOrder
      });

      await this.logSubmission(normalizedInitiator, 'QUEUE_SHUFFLE', {
        topEightIds: finalOrder.map((item) => item.id),
        seed
      });

      logger.info(`Shuffle triggered for channel ${this.channelId} by ${normalizedInitiator}`);
      return payload;
    } catch (error) {
      logger.error('Failed to trigger shuffle:', error);
      throw error;
    }
  }

  async reorderQueue(newOrder = null) {
    try {
      if (newOrder) {
        // Ensure newOrder does not include VIP items
        const vipList = await this._getVipList();
        const vipSet = new Set(vipList.map((v) => Number(v)));
        const filteredOrder = Array.isArray(newOrder)
          ? newOrder.filter((entry) => !vipSet.has(Number(entry.id)))
          : [];

        // Reorder based on provided order (VIPs intentionally excluded)
        for (let i = 0; i < filteredOrder.length; i++) {
          await this.db.queueItem.update({
            where: { id: filteredOrder[i].id },
            data: { position: i + 1 }
          });
        }
      } else {
        // Auto-reorder remaining items excluding VIPs
        const vipList = await this._getVipList();
        const pendingItems = await this.db.queueItem.findMany({
          where: { 
            channelId: this.channelId,
            status: { in: ORDERABLE_QUEUE_STATUSES },
            id: vipList.length ? { notIn: vipList } : undefined
          },
          orderBy: { position: 'asc' }
        });

        for (let i = 0; i < pendingItems.length; i++) {
          await this.db.queueItem.update({
            where: { id: pendingItems[i].id },
            data: { position: i + 1 }
          });
        }
      }

      // Emit updated queue
      const updatedQueue = await this.getCurrentQueue();
      this.io.emit('queue:updated', updatedQueue);

      logger.info('Queue reordered');
    } catch (error) {
      logger.error('Failed to reorder queue:', error);
      throw error;
    }
  }

  async listSubmissions({ statuses = ['PENDING'], limit = 50, offset = 0 } = {}) {
    try {
      const normalizedStatuses = (Array.isArray(statuses) && statuses.length ? statuses : ['PENDING'])
        .map((status) => status.toString().toUpperCase());

      const submissions = await this.db.queueItem.findMany({
        where: {
          channelId: this.channelId,
          status: { in: normalizedStatuses }
        },
        include: {
          submitter: {
            select: SUBMITTER_SELECT
          }
        },
        orderBy: [
          { createdAt: 'asc' }
        ],
        skip: offset,
        take: limit
      });

      return await this._hydrateQueueItems(submissions);
    } catch (error) {
      logger.error('Failed to list submissions:', error);
      throw error;
    }
  }

  async updateQueueItemStatus(itemId, newStatus, actor = 'system', options = {}) {
    try {
      const existing = await this.db.queueItem.findUnique({
        where: { id: itemId }
      });

      if (!existing || existing.channelId !== this.channelId) {
        throw new Error('Queue item not found for this channel');
      }

      const updateData = {
        status: newStatus
      };

      if (TERMINAL_QUEUE_STATUSES.includes(newStatus)) {
        updateData.playedAt = new Date();
      } else if (newStatus === 'PENDING') {
        updateData.playedAt = null;
      }

      if (typeof options.position === 'number' && Number.isFinite(options.position)) {
        updateData.position = options.position;
      }

      const updated = await this.db.queueItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
          submitter: {
            select: SUBMITTER_SELECT
          }
        }
      });

      await this.logSubmission(actor, 'UPDATE_STATUS', {
        videoId: updated.videoId,
        title: updated.title,
        previousStatus: existing.status,
        newStatus,
        note: options.note || null,
        reason: options.reason || null
      });

      this.io.emit('queue:item_status', {
        id: updated.id,
        status: newStatus,
        previousStatus: existing.status
      });

      const shouldReorder =
        ORDERABLE_QUEUE_STATUSES.includes(existing.status) ||
        ORDERABLE_QUEUE_STATUSES.includes(newStatus);

      if (shouldReorder) {
        await this.reorderQueue();
      }

      // If item moved to a terminal state, ensure it's removed from VIP queue
      if (TERMINAL_QUEUE_STATUSES.includes(newStatus)) {
        try {
          await this._removeVipEntry(itemId);
        } catch (err) {
          logger.warn('Failed to remove VIP entry after status update', { channelId: this.channelId, itemId, error: err });
        }
      }

      return await this._hydrateQueueItem(updated);
    } catch (error) {
      logger.error('Failed to update queue item status:', error);
      throw error;
    }
  }

  async setModerationState(itemId, actor = 'system', options = {}) {
    try {
      const existing = await this.db.queueItem.findUnique({
        where: { id: itemId },
        include: {
          submitter: {
            select: SUBMITTER_SELECT
          }
        }
      });

      if (!existing || existing.channelId !== this.channelId) {
        throw new Error('Queue item not found for this channel');
      }

      const normalizedStatus =
        options.moderationStatus === 'WARNING' ? 'WARNING' : 'APPROVED';
      const rawNote =
        options.note === undefined || options.note === null
          ? null
          : options.note.toString();
      const trimmedNote = rawNote ? rawNote.trim() : '';
      const sanitizedNote = trimmedNote
        ? trimmedNote.slice(0, MAX_MODERATION_NOTE_LENGTH)
        : null;
      const sanitizedDisplayName = options.moderatedByDisplayName
        ? options.moderatedByDisplayName.toString().trim().slice(0, 120)
        : null;

      const updateData = {
        moderationStatus: normalizedStatus,
        moderationNote: sanitizedNote,
        moderatedBy: actor || null,
        moderatedByDisplayName: sanitizedDisplayName,
        moderatedAt: new Date()
      };

      if (!sanitizedNote && normalizedStatus !== 'WARNING') {
        updateData.moderationNote = null;
      }

      const nextPosition =
        typeof options.position === 'number' && Number.isFinite(options.position)
          ? Math.max(1, Math.floor(options.position))
          : null;

      if (nextPosition) {
        updateData.position = nextPosition;
      }

      const nextQueueStatus = options.queueStatus || null;
      let shouldReorder = Boolean(nextPosition);

      if (nextQueueStatus && nextQueueStatus !== existing.status) {
        updateData.status = nextQueueStatus;

        if (TERMINAL_QUEUE_STATUSES.includes(nextQueueStatus)) {
          updateData.playedAt = new Date();
        } else if (nextQueueStatus === 'PENDING') {
          updateData.playedAt = null;
        }

        shouldReorder =
          shouldReorder ||
          ORDERABLE_QUEUE_STATUSES.includes(existing.status) ||
          ORDERABLE_QUEUE_STATUSES.includes(nextQueueStatus);
      }

      const updated = await this.db.queueItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
          submitter: {
            select: SUBMITTER_SELECT
          }
        }
      });

      await this.logSubmission(actor, 'MODERATION_UPDATE', {
        videoId: updated.videoId,
        title: updated.title,
        previousStatus: existing.status,
        newStatus: updateData.status || existing.status,
        previousModerationStatus: existing.moderationStatus || null,
        newModerationStatus: normalizedStatus,
        note: sanitizedNote,
        moderatedByDisplayName: sanitizedDisplayName,
        reason: options.reason || null
      });

      if (updateData.status && updateData.status !== existing.status) {
        this.io.emit('queue:item_status', {
          id: updated.id,
          status: updateData.status,
          previousStatus: existing.status
        });
      }

      if (shouldReorder) {
        await this.reorderQueue();
      }

      const hydratedItem = await this._hydrateQueueItem(updated);
      this.io.emit('queue:item_updated', { item: hydratedItem });

      return hydratedItem;
    } catch (error) {
      logger.error('Failed to update moderation state:', error);
      throw error;
    }
  }

  async warnQueueItem(itemId, actor = 'system', options = {}) {
    return this.setModerationState(itemId, actor, {
      moderationStatus: 'WARNING',
      note: options.note,
      position: options.position,
      moderatedByDisplayName: options.moderatedByDisplayName
    });
  }

  async approveQueueItem(itemId, actor = 'system', options = {}) {
    return this.setModerationState(itemId, actor, {
      moderationStatus: 'APPROVED',
      note: options.note,
      position: options.position,
      queueStatus: 'APPROVED',
      moderatedByDisplayName: options.moderatedByDisplayName
    });
  }

  async rejectQueueItem(itemId, actor = 'system', options = {}) {
    return this.setModerationState(itemId, actor, {
      moderationStatus: 'WARNING',
      note: options.note,
      position: options.position,
      queueStatus: 'REJECTED',
      moderatedByDisplayName: options.moderatedByDisplayName
    });
  }

  async markTopEight(itemId, actor = 'system', options = {}) {
    const updateOptions = { ...options };
    if (typeof updateOptions.position === 'number') {
      updateOptions.position = Math.max(1, Math.floor(updateOptions.position));
    }
    return this.updateQueueItemStatus(itemId, 'TOP_EIGHT', actor, updateOptions);
  }

  async getDuplicateInfo(videoId) {
    try {
      const [activeItem, previousItem] = await Promise.all([
        this.db.queueItem.findFirst({
          where: {
            channelId: this.channelId,
            videoId,
            status: { in: DUPLICATE_ACTIVE_STATUSES }
          },
          orderBy: { createdAt: 'desc' }
        }),
        this.db.queueItem.findFirst({
          where: {
            channelId: this.channelId,
            videoId,
            status: { in: DUPLICATE_HISTORY_STATUSES }
          },
          orderBy: [
            { playedAt: 'desc' },
            { createdAt: 'desc' }
          ],
          include: {
            judgeScores: true
          }
        })
      ]);

      let previousSummary = null;

      if (previousItem) {
        const judgeScores = Array.isArray(previousItem.judgeScores) ? previousItem.judgeScores : [];
        let averageScore = null;

        if (judgeScores.length) {
          const total = judgeScores.reduce((sum, score) => sum + Number(score.score), 0);
          averageScore = total / judgeScores.length;
        }

        previousSummary = {
          queueItemId: previousItem.id,
          status: previousItem.status,
          playedAt: previousItem.playedAt,
          judgeCount: judgeScores.length,
          averageScore: averageScore !== null ? Number(averageScore.toFixed(5)) : null
        };
      }

      return {
        activeItem,
        previousItem: previousSummary
      };
    } catch (error) {
      logger.error('Failed to determine duplicate info:', error);
      throw error;
    }
  }

  // Helper methods
  async getQueueSize() {
    return await this.db.queueItem.count({
      where: {
        channelId: this.channelId,
        status: { in: ACTIVE_QUEUE_STATUSES }
      }
    });
  }

  async getNextPosition() {
    const lastItem = await this.db.queueItem.findFirst({
      where: {
        channelId: this.channelId,
        status: { in: ACTIVE_QUEUE_STATUSES }
      },
      orderBy: { position: 'desc' }
    });

    return lastItem ? lastItem.position + 1 : 1;
  }

  async checkSubmissionCooldown(username) {
    const cooldownSeconds = parseInt(await this.getSetting('submission_cooldown', '30'));
    
    if (cooldownSeconds <= 0) return;

    const user = await this.db.user.findUnique({
      where: { 
        twitchUsername_channelId: {
          twitchUsername: username,
          channelId: this.channelId
        }
      }
    });

    if (user && user.lastSubmission) {
      const timeDiff = (Date.now() - user.lastSubmission.getTime()) / 1000;
      if (timeDiff < cooldownSeconds) {
        const remaining = Math.ceil(cooldownSeconds - timeDiff);
        throw new Error(`Please wait ${remaining} seconds before submitting another video`);
      }
    }
  }

  async logSubmission(username, action, details = {}) {
    try {
      await this.db.submissionLog.create({
        data: {
          channelId: this.channelId,
          username,
          action,
          details
        }
      });
    } catch (error) {
      logger.error('Failed to log submission:', error);
    }
  }

  async cleanupOldItems() {
    try {
      // Remove old played/skipped items (older than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      await this.db.queueItem.deleteMany({
        where: {
          channelId: this.channelId,
          status: { in: TERMINAL_QUEUE_STATUSES },
          playedAt: {
            lt: sevenDaysAgo
          }
        }
      });

      logger.info(`Old queue items cleaned up for channel: ${this.channelId}`);
    } catch (error) {
      logger.error('Failed to cleanup old items:', error);
    }
  }

  async _generateUniqueAlias() {
    if (!Array.isArray(anonNames) || !anonNames.length) {
      // Fallback if no names available
      const suffix = Math.random().toString(36).slice(-6).toUpperCase();
      return `Anon-${suffix}`;
    }

    // Get all currently used aliases in active queue items for this channel
    const usedAliases = await this.db.queueItem.findMany({
      where: {
        channelId: this.channelId,
        status: { in: ACTIVE_QUEUE_STATUSES },
        submitterAlias: { not: null }
      },
      select: { submitterAlias: true }
    });

    const usedAliasSet = new Set(usedAliases.map(item => item.submitterAlias));

    // Find unused aliases
    const availableAliases = anonNames.filter(name => !usedAliasSet.has(name));

    if (availableAliases.length > 0) {
      // Pick a random unused alias
      const randomIndex = Math.floor(Math.random() * availableAliases.length);
      return availableAliases[randomIndex];
    }

    // All aliases are in use, append a unique suffix to a random alias
    const baseName = anonNames[Math.floor(Math.random() * anonNames.length)];
    let suffix = 1;
    let uniqueAlias = `${baseName}${suffix}`;

    while (usedAliasSet.has(uniqueAlias)) {
      suffix++;
      uniqueAlias = `${baseName}${suffix}`;
    }

    return uniqueAlias;
  }

  async _hydrateQueueItems(items) {
    if (!Array.isArray(items) || !items.length) {
      return [];
    }

    const hydrated = await Promise.all(items.map((item) => this._hydrateQueueItem(item)));
    return hydrated;
  }

  async _hydrateQueueItem(item) {
    if (!item) {
      return null;
    }

    const submitterUsername =
      item.submitter?.twitchUsername || item.submitterUsername || null;

    const alias = item.submitterAlias || null;

    const submitter = submitterUsername
      ? {
          twitchUsername: submitterUsername,
          role: item.submitter?.role || null,
          alias
        }
      : item.submitter || null;

    return {
      ...item,
      submitterUsername: submitterUsername || item.submitterUsername,
      submitterAlias: alias,
      publicSubmitterName: alias || submitterUsername || null,
      submitter
    };
  }

  // VIP queue helpers: store FIFO array of queueItem IDs in bot settings under key 'vip_queue'
  async _getVipList() {
    try {
      const raw = await this.getSetting('vip_queue', '[]');
      const parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map((v) => Number(v)).filter((n) => Number.isInteger(n));
    } catch (error) {
      logger.warn('Failed to read vip_queue setting, returning empty list', { channelId: this.channelId, error });
      return [];
    }
  }

  async _setVipList(list) {
    try {
      const normalized = Array.isArray(list) ? list.map((v) => Number(v)).filter((n) => Number.isInteger(n)) : [];
      await this.updateSetting('vip_queue', JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      logger.warn('Failed to update vip_queue setting', { channelId: this.channelId, error });
      throw error;
    }
  }

  async addVipForItem(queueItemId) {
    try {
      const id = Number(queueItemId);
      if (!Number.isInteger(id)) return false;
      const list = await this._getVipList();
      if (!list.includes(id)) {
        list.push(id);
        await this._setVipList(list);
        this.io.emit('queue:vip_updated', { channelId: this.channelId, vipQueue: list });
      }
      return true;
    } catch (error) {
      logger.error('Failed to add VIP item:', { channelId: this.channelId, error });
      return false;
    }
  }

  async _removeVipEntry(queueItemId) {
    try {
      const id = Number(queueItemId);
      if (!Number.isInteger(id)) return false;
      const list = await this._getVipList();
      const filtered = list.filter((v) => v !== id);
      if (filtered.length !== list.length) {
        await this._setVipList(filtered);
        this.io.emit('queue:vip_updated', { channelId: this.channelId, vipQueue: filtered });
      }
      return true;
    } catch (error) {
      logger.warn('Failed to remove vip entry', { channelId: this.channelId, error });
      return false;
    }
  }

  _withCupInclude(baseInclude = {}) {
    if (this.cupRelationAvailable) {
      return {
        ...baseInclude,
        cup: {
          select: CUP_INCLUDE_SELECTION
        }
      };
    }
    return baseInclude;
  }

  _handleCupIncludeFailure(error) {
    if (this.cupRelationAvailable && this._isMissingCupRelationError(error)) {
      this.cupRelationAvailable = false;
      logger.warn(`Cup relation unavailable for channel ${this.channelId}; continuing without cup include`);
      return true;
    }
    return false;
  }

  _formatBroadcastItem(item, rank) {
    const submitterUsername = item.submitter?.twitchUsername || item.submitterUsername;
    const submitterAlias = item.submitterAlias || null;

    return {
      id: item.id,
      title: item.title,
      submitterUsername,
      submitterAlias,
      publicSubmitterName: submitterAlias || submitterUsername,
      status: item.status,
      position: item.position,
      rank,
      thumbnailUrl: item.thumbnailUrl,
      videoId: item.videoId,
      duration: item.duration,
      cup: item.cup
        ? {
            id: item.cup.id,
            title: item.cup.title,
            theme: item.cup.theme,
            status: item.cup.status
          }
        : null
    };
  }

  _isMissingCupRelationError(error) {
    if (!error) {
      return false;
    }

    if (error.code === 'P2022') {
      return true;
    }

    const message = typeof error.message === 'string' ? error.message : '';
    return message.includes('cup_id') || message.includes('queue_items.cup_id');
  }
}

module.exports = QueueService;
