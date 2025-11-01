const { getDatabase } = require('../database/connection');
const logger = require('../utils/logger');
const { generateJudgeToken, verifyJudgeToken } = require('../auth/judgeToken');

class JudgeService {
  constructor(io, channelId) {
    this.db = null;
    this.io = io;
    this.channelId = channelId;
    this.queueService = null;
  }

  bindQueueService(queueService) {
    this.queueService = queueService;
  }

  /**
   * Regenerate a token for a token-based judge (or create a token for an account-based judge)
   * Returns { token, session }
   */
  async regenerateToken(cupId, judgeIdentifier, options = {}) {
    try {
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');

      let judgeName = options.judgeName || null;

      // If token judge, try to lookup existing session to preserve judgeName
      if (isTokenJudge) {
        const existing = await this.db.judgeSession.findUnique({
          where: { cupId_judgeTokenId: { cupId, judgeTokenId: judgeIdentifier } }
        });

        if (existing) {
          judgeName = judgeName || existing.judgeName || null;

          // End the old session
          await this.db.judgeSession.update({
            where: { id: existing.id },
            data: { status: 'ENDED', endedAt: new Date() }
          });
        }
      } else {
        // Account-based judge: fetch the account display name if not provided
        if (!judgeName) {
          const account = await this.db.account.findUnique({ where: { id: judgeIdentifier } });
          judgeName = account?.displayName || account?.username || 'Judge';
        }
      }

      // Generate new token
      const token = generateJudgeToken({
        channelId: this.channelId,
        cupId,
        judgeName: judgeName || 'Anonymous Judge',
        expiresIn: options.expiresIn || '7d'
      });

      // Decode to get new judgeId
      const decoded = verifyJudgeToken(token);
      if (!decoded) {
        throw new Error('Failed to verify newly generated token');
      }

      const newJudgeId = decoded.judgeId;

      // Create a new session for the new token (or upsert)
      const session = await this.db.judgeSession.upsert({
        where: { cupId_judgeTokenId: { cupId, judgeTokenId: newJudgeId } },
        update: { status: 'ACTIVE', endedAt: null, judgeName },
        create: { cupId, judgeTokenId: newJudgeId, judgeName, status: 'ACTIVE' },
        include: {
          cup: { select: { title: true } },
          judge: false
        }
      });

      logger.info(`Regenerated judge token for cup ${cupId}: ${newJudgeId}`);
      this.io.emit('judge:token_regenerated', { cupId, newJudgeId, oldJudgeId: judgeIdentifier });

      return { token, session };
    } catch (error) {
      logger.error('Failed to regenerate judge token:', error);
      throw error;
    }
  }

  async initialize() {
    this.db = getDatabase();
    logger.info(`JudgeService initialized for channel: ${this.channelId}`);
  }

  /**
   * Create or get a judge session for a cup
   * Can be called with either an Account ID or a token-based judge ID
   */
  async createSession(cupId, judgeIdentifier, judgeName = null) {
    try {
      // Determine if this is a token-based judge (starts with "judge_") or account ID
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      
      // Use upsert to handle both create and update cases
      const includeClause = {
        cup: {
          select: {
            title: true,
            theme: true,
            status: true
          }
        },
        judge: isTokenJudge ? false : {
          select: {
            username: true,
            displayName: true
          }
        }
      };

      let session;
      
      if (isTokenJudge) {
        session = await this.db.judgeSession.upsert({
          where: {
            cupId_judgeTokenId: { cupId, judgeTokenId: judgeIdentifier }
          },
          update: {
            status: 'ACTIVE',
            endedAt: null,
            judgeName: judgeName
          },
          create: {
            cupId,
            judgeTokenId: judgeIdentifier,
            judgeName,
            status: 'ACTIVE'
          },
          include: includeClause
        });
      } else {
        session = await this.db.judgeSession.upsert({
          where: {
            cupId_judgeAccountId: { cupId, judgeAccountId: judgeIdentifier }
          },
          update: {
            status: 'ACTIVE',
            endedAt: null
          },
          create: {
            cupId,
            judgeAccountId: judgeIdentifier,
            status: 'ACTIVE'
          },
          include: includeClause
        });
      }

      logger.info(`Judge session created/reactivated: ${judgeIdentifier} for cup ${cupId}`);
      this.io.emit('judge:session_created', { session });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeSessionEvent('session_created', { session });
        } catch (eventError) {
          logger.warn('QueueService failed to handle session_created event', eventError);
        }
      }

      return session;
    } catch (error) {
      logger.error('Failed to create judge session:', error);
      throw error;
    }
  }

  /**
   * End a judge session
   */
  async endSession(cupId, judgeIdentifier) {
    try {
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      const whereClause = isTokenJudge
        ? { cupId_judgeTokenId: { cupId, judgeTokenId: judgeIdentifier } }
        : { cupId_judgeAccountId: { cupId, judgeAccountId: judgeIdentifier } };

      const session = await this.db.judgeSession.update({
        where: whereClause,
        data: {
          status: 'ENDED',
          endedAt: new Date()
        }
      });

      logger.info(`Judge session ended: ${judgeIdentifier} for cup ${cupId}`);
      this.io.emit('judge:session_ended', { session });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeSessionEvent('session_ended', { session });
        } catch (eventError) {
          logger.warn('QueueService failed to handle session_ended event', eventError);
        }
      }

      return session;
    } catch (error) {
      logger.error('Failed to end judge session:', error);
      throw error;
    }
  }

  /**
   * Update judge name in session
   */
  async updateJudgeName(cupId, judgeIdentifier, newName) {
    try {
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      
      if (!isTokenJudge) {
        throw new Error('Only token-based judges can update their name');
      }

      const whereClause = { cupId_judgeTokenId: { cupId, judgeTokenId: judgeIdentifier } };

      const session = await this.db.judgeSession.update({
        where: whereClause,
        data: {
          judgeName: newName
        },
        include: {
          cup: {
            select: {
              title: true,
              theme: true,
              status: true
            }
          }
        }
      });

      // Also update all scores by this judge
      await this.db.judgeScore.updateMany({
        where: {
          cupId,
          judgeTokenId: judgeIdentifier
        },
        data: {
          judgeName: newName
        }
      });

      logger.info(`Judge name updated: ${judgeIdentifier} -> ${newName} for cup ${cupId}`);
      this.io.emit('judge:name_updated', { session });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeSessionEvent('name_updated', { session });
        } catch (eventError) {
          logger.warn('QueueService failed to handle name_updated event', eventError);
        }
      }

      return session;
    } catch (error) {
      logger.error('Failed to update judge name:', error);
      throw error;
    }
  }

  /**
   * Submit or update a judge's score for a queue item
   */
  async submitScore(cupId, queueItemId, judgeIdentifier, scoreValue, comment = null, judgeName = null) {
    try {
      // Validate score is within range
      const score = Number(scoreValue);
      if (isNaN(score) || score < 0 || score > 5) {
        throw new Error('Score must be between 0.00000 and 5.00000');
      }

      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      
      // Build where clause for finding existing score
      const whereClause = isTokenJudge
        ? { cupId_queueItemId_judgeTokenId: { cupId, queueItemId, judgeTokenId: judgeIdentifier } }
        : { cupId_queueItemId_judgeAccountId: { cupId, queueItemId, judgeAccountId: judgeIdentifier } };

      // Check if score already exists
      const existingScore = await this.db.judgeScore.findUnique({
        where: whereClause
      });

      // If score is locked, prevent changes
      if (existingScore?.isLocked) {
        throw new Error('This score is locked and cannot be changed');
      }

      let judgeScore;

      const includeClause = {
        judge: isTokenJudge ? false : {
          select: {
            username: true,
            displayName: true
          }
        },
        queueItem: {
          select: {
            title: true,
            submitterUsername: true
          }
        }
      };

      if (existingScore) {
        // Update existing score
        judgeScore = await this.db.judgeScore.update({
          where: whereClause,
          data: {
            score,
            comment
          },
          include: includeClause
        });

        logger.info(`Judge score updated: ${judgeIdentifier} scored ${score} for item ${queueItemId}`);
      } else {
        // Create new score
        const scoreData = isTokenJudge
          ? { cupId, queueItemId, judgeTokenId: judgeIdentifier, judgeName, score, comment }
          : { cupId, queueItemId, judgeAccountId: judgeIdentifier, score, comment };

        judgeScore = await this.db.judgeScore.create({
          data: scoreData,
          include: includeClause
        });

        logger.info(`Judge score submitted: ${judgeIdentifier} scored ${score} for item ${queueItemId}`);
      }

      // Emit event for real-time updates
      this.io.emit('judge:score_updated', { judgeScore });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeScoreEvent('score_updated', { judgeScore });
        } catch (eventError) {
          logger.warn('QueueService failed to handle score_updated event', eventError);
        }
      }

      return judgeScore;
    } catch (error) {
      logger.error('Failed to submit judge score:', error);
      throw error;
    }
  }

  /**
   * Lock a judge's vote (manual lock)
   */
  async lockVote(cupId, queueItemId, judgeIdentifier) {
    try {
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      const whereClause = isTokenJudge
        ? { cupId_queueItemId_judgeTokenId: { cupId, queueItemId, judgeTokenId: judgeIdentifier } }
        : { cupId_queueItemId_judgeAccountId: { cupId, queueItemId, judgeAccountId: judgeIdentifier } };

      const judgeScore = await this.db.judgeScore.update({
        where: whereClause,
        data: {
          isLocked: true,
          lockType: 'MANUAL',
          lockedAt: new Date()
        },
        include: {
          judge: isTokenJudge ? false : {
            select: {
              username: true,
              displayName: true
            }
          }
        }
      });

      logger.info(`Judge vote locked (MANUAL): ${judgeIdentifier} for item ${queueItemId}`);
      this.io.emit('judge:vote_locked', { judgeScore });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeScoreEvent('vote_locked', { judgeScore });
        } catch (eventError) {
          logger.warn('QueueService failed to handle vote_locked event', eventError);
        }
      }

      return judgeScore;
    } catch (error) {
      logger.error('Failed to lock judge vote:', error);
      throw error;
    }
  }

  /**
   * Unlock a judge's vote (only if manually locked)
   */
  async unlockVote(cupId, queueItemId, judgeIdentifier) {
    try {
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      const whereClause = isTokenJudge
        ? { cupId_queueItemId_judgeTokenId: { cupId, queueItemId, judgeTokenId: judgeIdentifier } }
        : { cupId_queueItemId_judgeAccountId: { cupId, queueItemId, judgeAccountId: judgeIdentifier } };
      const existingScore = await this.db.judgeScore.findUnique({
        where: whereClause
      });

      if (!existingScore) {
        throw new Error('Score not found');
      }

      if (existingScore.lockType === 'FORCED') {
        throw new Error('Cannot unlock a forced lock. Host must unlock all forced locks.');
      }

      const judgeScore = await this.db.judgeScore.update({
        where: whereClause,
        data: {
          isLocked: false,
          lockType: null,
          lockedAt: null
        },
        include: {
          judge: isTokenJudge ? false : {
            select: {
              username: true,
              displayName: true
            }
          }
        }
      });

      logger.info(`Judge vote unlocked: ${judgeIdentifier} for item ${queueItemId}`);
      this.io.emit('judge:vote_unlocked', { judgeScore });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeScoreEvent('vote_unlocked', { judgeScore });
        } catch (eventError) {
          logger.warn('QueueService failed to handle vote_unlocked event', eventError);
        }
      }

      return judgeScore;
    } catch (error) {
      logger.error('Failed to unlock judge vote:', error);
      throw error;
    }
  }

  /**
   * Force lock all unlocked votes for a queue item (host action)
   */
  async forceLockAllVotes(cupId, queueItemId) {
    try {
      const result = await this.db.judgeScore.updateMany({
        where: {
          cupId,
          queueItemId,
          isLocked: false
        },
        data: {
          isLocked: true,
          lockType: 'FORCED',
          lockedAt: new Date()
        }
      });

      logger.info(`All votes force-locked for item ${queueItemId}: ${result.count} votes locked`);
      this.io.emit('judge:all_votes_locked', { cupId, queueItemId, count: result.count });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeScoreEvent('all_votes_locked', { cupId, queueItemId, count: result.count });
        } catch (eventError) {
          logger.warn('QueueService failed to handle all_votes_locked event', eventError);
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to force lock all votes:', error);
      throw error;
    }
  }

  /**
   * Unlock all forced locks for a queue item (host action)
   */
  async unlockAllForcedVotes(cupId, queueItemId) {
    try {
      const result = await this.db.judgeScore.updateMany({
        where: {
          cupId,
          queueItemId,
          lockType: 'FORCED'
        },
        data: {
          isLocked: false,
          lockType: null,
          lockedAt: null
        }
      });

      logger.info(`All forced locks removed for item ${queueItemId}: ${result.count} votes unlocked`);
      this.io.emit('judge:all_forced_locks_removed', { cupId, queueItemId, count: result.count });
      if (this.queueService) {
        try {
          this.queueService.handleJudgeScoreEvent('all_forced_locks_removed', { cupId, queueItemId, count: result.count });
        } catch (eventError) {
          logger.warn('QueueService failed to handle all_forced_locks_removed event', eventError);
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to unlock all forced votes:', error);
      throw error;
    }
  }

  /**
   * Get all scores for a queue item
   */
  async getScoresForItem(cupId, queueItemId) {
    try {
      const scores = await this.db.judgeScore.findMany({
        where: {
          cupId,
          queueItemId
        },
        include: {
          judge: {
            select: {
              username: true,
              displayName: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return scores;
    } catch (error) {
      logger.error('Failed to get scores for item:', error);
      throw error;
    }
  }

  /**
   * Calculate average score for a queue item
   */
  async calculateAverageScore(cupId, queueItemId) {
    try {
      const scores = await this.db.judgeScore.findMany({
        where: {
          cupId,
          queueItemId
        },
        select: {
          score: true
        }
      });

      if (scores.length === 0) {
        return {
          average: null,
          count: 0,
          total: 0
        };
      }

      const total = scores.reduce((sum, s) => sum + Number(s.score), 0);
      const average = total / scores.length;

      return {
        average: Number(average.toFixed(5)),
        count: scores.length,
        total: Number(total.toFixed(5))
      };
    } catch (error) {
      logger.error('Failed to calculate average score:', error);
      throw error;
    }
  }

  /**
   * Get a judge's current score for an item
   */
  async getJudgeScore(cupId, queueItemId, judgeIdentifier) {
    try {
      const isTokenJudge = typeof judgeIdentifier === 'string' && judgeIdentifier.startsWith('judge_');
      const whereClause = isTokenJudge
        ? { cupId_queueItemId_judgeTokenId: { cupId, queueItemId, judgeTokenId: judgeIdentifier } }
        : { cupId_queueItemId_judgeAccountId: { cupId, queueItemId, judgeAccountId: judgeIdentifier } };

      const score = await this.db.judgeScore.findUnique({
        where: whereClause,
        include: {
          queueItem: {
            select: {
              title: true,
              videoUrl: true,
              thumbnailUrl: true,
              submitterUsername: true
            }
          }
        }
      });

      return score;
    } catch (error) {
      logger.error('Failed to get judge score:', error);
      throw error;
    }
  }

  /**
   * Get all scores submitted by a judge in a cup
   */
  async getJudgeScoresForCup(cupId, judgeAccountId) {
    try {
      const scores = await this.db.judgeScore.findMany({
        where: {
          cupId,
          judgeAccountId
        },
        include: {
          queueItem: {
            select: {
              title: true,
              submitterUsername: true,
              status: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return scores;
    } catch (error) {
      logger.error('Failed to get judge scores for cup:', error);
      throw error;
    }
  }

  /**
   * Check if all judges have submitted scores for an item
   */
  async areAllScoresSubmitted(cupId, queueItemId) {
    try {
      // Get all judges for this cup
      const judges = await this.db.channelRoleAssignment.findMany({
        where: {
          cupId,
          role: 'JUDGE'
        },
        select: {
          accountId: true
        }
      });

      const judgeIds = judges.map(j => j.accountId);

      if (judgeIds.length === 0) {
        return { complete: false, submitted: 0, total: 0 };
      }

      // Count how many have submitted scores
      const submittedCount = await this.db.judgeScore.count({
        where: {
          cupId,
          queueItemId,
          judgeAccountId: { in: judgeIds }
        }
      });

      return {
        complete: submittedCount === judgeIds.length,
        submitted: submittedCount,
        total: judgeIds.length
      };
    } catch (error) {
      logger.error('Failed to check if all scores submitted:', error);
      throw error;
    }
  }

  /**
   * List judge sessions for a cup
   */
  async listSessions(cupId) {
    try {
      const sessions = await this.db.judgeSession.findMany({
        where: { cupId },
        include: {
          judge: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          },
          cup: {
            select: {
              title: true
            }
          }
        },
        orderBy: { startedAt: 'desc' }
      });

      return sessions;
    } catch (error) {
      logger.error('Failed to list judge sessions:', error);
      throw error;
    }
  }
}

module.exports = JudgeService;
