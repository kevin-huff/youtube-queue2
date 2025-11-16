const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getDatabase } = require('../database/connection');

// Secret for signing judge tokens (in production, use environment variable)
const JUDGE_TOKEN_SECRET = process.env.JUDGE_TOKEN_SECRET || 'your-judge-secret-key-change-in-production';

/**
 * Generate a JWT token that grants judge access to a specific cup
 * @param {Object} options - Token options
 * @param {string} options.channelId - The channel ID
 * @param {string} options.cupId - The cup ID the judge can access
 * @param {string} options.judgeName - Optional name for the judge (for display purposes)
 * @param {string} options.expiresIn - Token expiration (default: 7 days)
 * @returns {string} JWT token
 */
function generateJudgeToken({ channelId, cupId, judgeName = 'Anonymous Judge', expiresIn = '7d' }) {
  const payload = {
    type: 'JUDGE',
    channelId,
    cupId,
    judgeName,
    // Generate unique judge ID for this token
    judgeId: `judge_${Date.now()}_${Math.random().toString(36).substring(7)}`
  };

  return jwt.sign(payload, JUDGE_TOKEN_SECRET, { expiresIn });
}

/**
 * Verify and decode a judge token
 * @param {string} token - The JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
function verifyJudgeToken(token) {
  try {
    const decoded = jwt.verify(token, JUDGE_TOKEN_SECRET);
    
    // Ensure it's a judge token
    if (decoded.type !== 'JUDGE') {
      logger.warn('Token verification failed: not a judge token');
      return null;
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Judge token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid judge token:', error.message);
    } else {
      logger.error('Error verifying judge token:', error);
    }
    return null;
  }
}

/**
 * Middleware to authenticate judge via token
 * Extracts token from query param or Authorization header
 * Creates a pseudo-user object for the judge session
 */
const authenticateJudgeToken = async (req, res, next) => {
  // Try to get token from query param (for initial URL access)
  let token = req.query.token || req.query.judgeToken;
  
  // Try to get from Authorization header (for API calls)
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  // Try to get from session (if already authenticated in this session)
  if (!token && req.session && req.session.judgeToken) {
    token = req.session.judgeToken;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Judge authentication required',
      message: 'No judge token provided. Please use the link provided to you.'
    });
  }

  const decoded = verifyJudgeToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired judge token',
      message: 'Your judge link may have expired. Please request a new one.'
    });
  }

  // Ensure there's an ACTIVE judge session for this token/cup combination
  try {
    const db = getDatabase();
    const session = await db.judgeSession.findUnique({
      where: {
        cupId_judgeTokenId: {
          cupId: decoded.cupId,
          judgeTokenId: decoded.judgeId
        }
      }
    });

    if (session) {
      if (session.status !== 'ACTIVE') {
        logger.warn(`Judge token rejected: session not active for ${decoded.judgeId}`);
        return res.status(401).json({
          error: 'Judge token revoked or session inactive',
          message: 'This judge link has been revoked or the session is not active. Please request a new link.'
        });
      }
    } else {
      logger.info(`Judge token ${decoded.judgeId} has no session yet; allowing bootstrap authentication`);
    }
  } catch (err) {
    logger.error('Error checking judge session for token:', err);
    // Fail closed: reject authentication if DB check can't be completed
    return res.status(500).json({ error: 'Failed to validate judge session' });
  }

  // Verify the token matches the requested channel and cup
  const requestedChannelId = req.params.channelId;
  const requestedCupId = req.params.cupId;

  if (requestedChannelId && decoded.channelId !== requestedChannelId.toLowerCase()) {
    return res.status(403).json({
      error: 'Token does not grant access to this channel'
    });
  }

  if (requestedCupId && decoded.cupId !== requestedCupId) {
    return res.status(403).json({
      error: 'Token does not grant access to this cup'
    });
  }

  // Store token in session for subsequent requests
  if (req.session) {
    req.session.judgeToken = token;
  }

  // Create a pseudo-user object for the judge
  req.judgeAuth = {
    type: 'JUDGE',
    judgeId: decoded.judgeId,
    judgeName: decoded.judgeName,
    channelId: decoded.channelId,
    cupId: decoded.cupId,
    token: token
  };

  // Set channelId for compatibility with existing middleware
  req.channelId = decoded.channelId;

  logger.info(`Judge authenticated: ${decoded.judgeName} (${decoded.judgeId}) for cup ${decoded.cupId}`);

  next();
};

/**
 * Middleware that allows either regular auth OR judge token auth
 * Use this for endpoints that should be accessible to both authenticated users and judges with tokens
 */
const optionalJudgeAuth = (req, res, next) => {
  // Check if already authenticated as regular user
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  // Try judge token authentication
  authenticateJudgeToken(req, res, next);
};

module.exports = {
  generateJudgeToken,
  verifyJudgeToken,
  authenticateJudgeToken,
  optionalJudgeAuth
};
