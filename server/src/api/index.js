const express = require('express');
const cors = require('cors');
const { body, param, query, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to validate request data
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Simple auth middleware for admin routes
const authenticateAdmin = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Auth routes
router.post('/auth/login', [
  body('password').notEmpty().withMessage('Password is required')
], validate, async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      return res.status(500).json({ error: 'Admin password not configured' });
    }

    // Simple password check (in production, use proper hashing)
    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { role: 'admin', timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      expiresIn: '24h',
      user: { role: 'admin' }
    });

    logger.info('Admin login successful');
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Queue routes
router.get('/queue/current', async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    const queue = await queueService.getCurrentQueue();
    const isEnabled = await queueService.isQueueEnabled();
    const currentlyPlaying = queueService.currentlyPlaying;
    
    res.json({
      queue,
      enabled: isEnabled,
      currentlyPlaying,
      total: queue.length
    });
  } catch (error) {
    logger.error('Error getting current queue:', error);
    res.status(500).json({ error: 'Failed to get queue' });
  }
});

router.get('/queue/status', async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    const isEnabled = await queueService.isQueueEnabled();
    const queueSize = await queueService.getQueueSize();
    const maxSize = await queueService.getSetting('max_queue_size', '50');
    const volume = await queueService.getSetting('current_volume', '75');
    
    res.json({
      enabled: isEnabled,
      size: queueSize,
      maxSize: parseInt(maxSize),
      volume: parseInt(volume)
    });
  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

router.post('/queue/add', authenticateAdmin, [
  body('url').isURL().withMessage('Valid URL is required'),
  body('submitter').notEmpty().withMessage('Submitter is required')
], validate, async (req, res) => {
  try {
    const { url, submitter } = req.body;
    const queueService = req.app.get('queueService');
    const videoService = req.app.get('videoService');
    
    if (!queueService || !videoService) {
      return res.status(500).json({ error: 'Services not available' });
    }

    // Get video metadata
    const metadata = await videoService.getVideoMetadata(url);
    
    // Add to queue
    const queueItem = await queueService.addToQueue(metadata, submitter);
    
    res.status(201).json(queueItem);
    logger.info(`Video added via API: ${metadata.title} by ${submitter}`);
  } catch (error) {
    logger.error('Error adding video to queue:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/queue/:id', authenticateAdmin, [
  param('id').isInt().withMessage('Valid item ID is required')
], validate, async (req, res) => {
  try {
    const { id } = req.params;
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    await queueService.removeFromQueue(parseInt(id), 'admin');
    res.json({ success: true });
    
    logger.info(`Video removed via API: ${id}`);
  } catch (error) {
    logger.error('Error removing video from queue:', error);
    res.status(400).json({ error: error.message });
  }
});

router.patch('/queue/reorder', authenticateAdmin, [
  body('items').isArray().withMessage('Items array is required')
], validate, async (req, res) => {
  try {
    const { items } = req.body;
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    await queueService.reorderQueue(items);
    res.json({ success: true });
    
    logger.info('Queue reordered via API');
  } catch (error) {
    logger.error('Error reordering queue:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/queue/play-next', authenticateAdmin, async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    const nextVideo = await queueService.playNext();
    res.json({ nextVideo });
    
    logger.info(`Next video requested via API: ${nextVideo?.title || 'none'}`);
  } catch (error) {
    logger.error('Error playing next video:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/queue/skip', authenticateAdmin, async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    const nextVideo = await queueService.skipCurrent('admin');
    res.json({ nextVideo });
    
    logger.info('Video skipped via API');
  } catch (error) {
    logger.error('Error skipping video:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/queue/clear', authenticateAdmin, async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    await queueService.clearQueue('admin');
    res.json({ success: true });
    
    logger.info('Queue cleared via API');
  } catch (error) {
    logger.error('Error clearing queue:', error);
    res.status(400).json({ error: error.message });
  }
});

// Settings routes
router.get('/settings', authenticateAdmin, async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    const settings = {
      queue_enabled: await queueService.getSetting('queue_enabled', 'false'),
      max_queue_size: await queueService.getSetting('max_queue_size', '50'),
      submission_cooldown: await queueService.getSetting('submission_cooldown', '30'),
      max_video_duration: await queueService.getSetting('max_video_duration', '600'),
      auto_play_next: await queueService.getSetting('auto_play_next', 'true'),
      current_volume: await queueService.getSetting('current_volume', '75')
    };

    res.json(settings);
  } catch (error) {
    logger.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.put('/settings/:key', authenticateAdmin, [
  param('key').notEmpty().withMessage('Setting key is required'),
  body('value').notEmpty().withMessage('Setting value is required')
], validate, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const queueService = req.app.get('queueService');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Queue service not available' });
    }

    await queueService.updateSetting(key, value);
    res.json({ success: true, key, value });
    
    logger.info(`Setting updated via API: ${key} = ${value}`);
  } catch (error) {
    logger.error('Error updating setting:', error);
    res.status(400).json({ error: error.message });
  }
});

// Bot status routes
router.get('/bot/status', async (req, res) => {
  try {
    const bot = req.app.get('bot');
    
    if (!bot) {
      return res.json({ connected: false, error: 'Bot not initialized' });
    }

    const stats = bot.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting bot status:', error);
    res.status(500).json({ error: 'Failed to get bot status' });
  }
});

// Video validation route
router.post('/video/validate', [
  body('url').isURL().withMessage('Valid URL is required')
], validate, async (req, res) => {
  try {
    const { url } = req.body;
    const videoService = req.app.get('videoService');
    
    if (!videoService) {
      return res.status(500).json({ error: 'Video service not available' });
    }

    const isValid = videoService.isValidVideoUrl(url);
    
    if (!isValid) {
      return res.json({ valid: false, error: 'Unsupported video URL format' });
    }

    // Try to get metadata to fully validate
    try {
      const metadata = await videoService.getVideoMetadata(url);
      res.json({ valid: true, metadata });
    } catch (error) {
      res.json({ valid: false, error: error.message });
    }
  } catch (error) {
    logger.error('Error validating video:', error);
    res.status(500).json({ error: 'Failed to validate video' });
  }
});

// Statistics routes
router.get('/stats', async (req, res) => {
  try {
    const queueService = req.app.get('queueService');
    const videoService = req.app.get('videoService');
    const bot = req.app.get('bot');
    
    if (!queueService) {
      return res.status(500).json({ error: 'Services not available' });
    }

    const queueSize = await queueService.getQueueSize();
    const isEnabled = await queueService.isQueueEnabled();
    const cacheStats = videoService ? videoService.getCacheStats() : null;
    const botStats = bot ? bot.getStats() : null;

    res.json({
      queue: {
        size: queueSize,
        enabled: isEnabled,
        currentlyPlaying: queueService.currentlyPlaying ? true : false
      },
      cache: cacheStats,
      bot: botStats,
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error('API Error:', error);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

module.exports = router;
