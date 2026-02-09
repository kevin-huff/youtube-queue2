const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  return next();
};

// File upload handling for per-channel assets (e.g., shuffle audio)
// Use env-configurable absolute dir for deployments with volumes (e.g., Railway)
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');
// Log the resolved uploads root once when this module loads
try {
  logger.info('Uploads root resolved', { env: process.env.UPLOADS_DIR || null, path: UPLOADS_ROOT });
} catch (err) { logger.warn('Failed to log uploads root resolution', { error: err?.message }); }
const ensureDir = (dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created uploads directory', { dir });
    }
  } catch (e) {
    logger.error('Failed to create uploads directory', { dir, error: e?.message });
  }
};
ensureDir(UPLOADS_ROOT);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const channelId = (req.params.channelId || 'default').toString().toLowerCase();
    const channelDir = path.join(UPLOADS_ROOT, channelId);
    ensureDir(channelDir);
    try {
      logger.info('Upload destination (shuffle)', {
        channelId,
        channelDir,
        uploadsRoot: UPLOADS_ROOT,
        route: req.originalUrl
      });
    } catch (err) { logger.warn('Failed to log shuffle upload destination', { error: err?.message }); }
    cb(null, channelDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.mp3';
    const safeExt = ext.length <= 8 ? ext.toLowerCase() : '.mp3';
    const name = `shuffle-${Date.now()}${safeExt}`;
    try {
      logger.info('Assigned filename (shuffle)', { original: file.originalname, assigned: name, mime: file.mimetype });
    } catch (err) { logger.warn('Failed to log shuffle filename assignment', { error: err?.message }); }
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ok = (file.mimetype || '').startsWith('audio/');
    if (ok) return cb(null, true);
    const err = new Error('Only audio files are allowed');
    err.status = 400;
    return cb(err);
  }
});

// Separate storage for soundboard to distinguish filenames
const sbStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const channelId = (req.params.channelId || 'default').toString().toLowerCase();
    const channelDir = path.join(UPLOADS_ROOT, channelId);
    ensureDir(channelDir);
    try {
      logger.info('Upload destination (soundboard)', {
        channelId,
        channelDir,
        uploadsRoot: UPLOADS_ROOT,
        route: req.originalUrl
      });
    } catch (err) { logger.warn('Failed to log soundboard upload destination', { error: err?.message }); }
    cb(null, channelDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.mp3';
    const safeExt = ext.length <= 8 ? ext.toLowerCase() : '.mp3';
    const name = `sound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    try {
      logger.info('Assigned filename (soundboard)', { original: file.originalname, assigned: name, mime: file.mimetype });
    } catch (err) { logger.warn('Failed to log soundboard filename assignment', { error: err?.message }); }
    cb(null, name);
  }
});

const sbUpload = multer({
  storage: sbStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = (file.mimetype || '').startsWith('audio/');
    if (ok) return cb(null, true);
    const err = new Error('Only audio files are allowed');
    err.status = 400;
    return cb(err);
  }
});

const getChannelManager = (req) => {
  const manager = req.app.get('channelManager');
  if (!manager) {
    throw Object.assign(new Error('Channel manager not available'), { status: 500 });
  }
  return manager;
};

// Admin utilities (gate by Twitch user id)
const ADMIN_TWITCH_IDS = (process.env.ADMIN_TWITCH_IDS || '77292575')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const requireAdmin = async (req, res, next) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const channelManager = getChannelManager(req);
    const account = await channelManager.prisma.account.findUnique({
      where: { id: req.user.id },
      select: { twitchId: true, username: true }
    });
    const twitchId = account?.twitchId ? String(account.twitchId) : null;
    if (twitchId && ADMIN_TWITCH_IDS.includes(twitchId)) {
      return next();
    }
    return res.status(403).json({ error: 'Admin access required' });
  } catch (err) {
    logger.error('Admin check failed', { error: err?.message });
    return res.status(500).json({ error: 'Admin check failed' });
  }
};

const requireChannelOwnership = async (channelManager, accountId, channelId) => {
  const normalizedChannelId = channelId.toLowerCase();
  const owned = await channelManager.getUserChannels(accountId);
  if (!owned.includes(normalizedChannelId)) {
    throw Object.assign(new Error('Access denied to this channel'), { status: 403 });
  }
  return normalizedChannelId;
};

const getQueueServiceOrThrow = (channelManager, channelId, { requireActive = true } = {}) => {
  const queueService = channelManager.getQueueService(channelId);
  if (!queueService) {
    const error = new Error('Channel not found or inactive');
    error.status = requireActive ? 404 : 200;
    throw error;
  }
  return queueService;
};

const ensureOwnerOrManager = async (channelManager, accountId, channelId) => {
  const normalizedChannelId = await requireChannelOwnership(channelManager, accountId, channelId);
  const ownership = await channelManager.prisma.channelOwner.findUnique({
    where: {
      accountId_channelId: {
        accountId,
        channelId: normalizedChannelId
      }
    }
  });

  if (!ownership || !['OWNER', 'MANAGER'].includes(ownership.role)) {
    const error = new Error('Channel owner or manager access required');
    error.status = 403;
    throw error;
  }

  return normalizedChannelId;
};

// Require that the current user is the OWNER of the channel
const ensureOwnerOnly = async (channelManager, accountId, channelId) => {
  const normalizedChannelId = await requireChannelOwnership(channelManager, accountId, channelId);
  const ownership = await channelManager.prisma.channelOwner.findUnique({
    where: {
      accountId_channelId: {
        accountId,
        channelId: normalizedChannelId
      }
    }
  });

  if (!ownership || ownership.role !== 'OWNER') {
    const error = new Error('Channel owner access required');
    error.status = 403;
    throw error;
  }

  return normalizedChannelId;
};

const formatRoleAssignment = (assignment) => ({
  id: assignment.id,
  channelId: assignment.channelId,
  role: assignment.role,
  cupId: assignment.cupId,
  expiresAt: assignment.expiresAt,
  createdAt: assignment.createdAt,
  accountId: assignment.accountId,
  account: assignment.account
    ? {
        id: assignment.account.id,
        username: assignment.account.username,
        displayName: assignment.account.displayName,
        profileImageUrl: assignment.account.profileImageUrl
      }
    : null,
  cup: assignment.cup
    ? {
        id: assignment.cup.id,
        title: assignment.cup.title,
        slug: assignment.cup.slug,
        status: assignment.cup.status
      }
    : null
});

const formatChannelOwner = (owner) => ({
  id: owner.id,
  accountId: owner.accountId,
  role: owner.role,
  createdAt: owner.createdAt,
  account: owner.account
    ? {
        id: owner.account.id,
        username: owner.account.username,
        displayName: owner.account.displayName,
        profileImageUrl: owner.account.profileImageUrl
  }
  : null
});

const formatRoleInvite = (invite) => ({
  id: invite.id,
  channelId: invite.channelId,
  invitedUsername: invite.invitedUsername,
  role: invite.role,
  cupId: invite.cupId,
  note: invite.note || null,
  expiresAt: invite.expiresAt,
  acceptedAt: invite.acceptedAt,
  createdAt: invite.createdAt,
  assignedBy: invite.assignedBy,
  assignedByAccount: invite.assignedByAccount
    ? {
        id: invite.assignedByAccount.id,
        username: invite.assignedByAccount.username,
        displayName: invite.assignedByAccount.displayName,
        profileImageUrl: invite.assignedByAccount.profileImageUrl
      }
    : null,
  cup: invite.cup
    ? {
        id: invite.cup.id,
        title: invite.cup.title,
        slug: invite.cup.slug,
        status: invite.cup.status
      }
    : null
});

const SUBMITTER_FIELDS = {
  twitchUsername: true,
  role: true
};

module.exports = {
  validate,
  UPLOADS_ROOT,
  ensureDir,
  upload,
  sbUpload,
  getChannelManager,
  ADMIN_TWITCH_IDS,
  requireAdmin,
  requireChannelOwnership,
  getQueueServiceOrThrow,
  ensureOwnerOrManager,
  ensureOwnerOnly,
  formatRoleAssignment,
  formatChannelOwner,
  formatRoleInvite,
  SUBMITTER_FIELDS
};
