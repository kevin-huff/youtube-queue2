const express = require('express');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const { initializeDatabase } = require('./database/connection');
const apiRoutes = require('./api');
const socketHandler = require('./socket');
const TwitchBot = require('./bot/TwitchBot');
const ChannelManager = require('./services/ChannelManager');
const VideoService = require('./services/VideoService');
const RoleService = require('./services/RoleService');
require('./auth/passport'); // Initialize passport strategies

class Server {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.allowedOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const socketCorsOrigin = this.allowedOrigins.length ? this.allowedOrigins : true; // reflect request origin when not set

    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: socketCorsOrigin,
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    this.port = process.env.PORT || 5000;
    this.bot = null;
    this.channelManager = null;
    this.videoService = null;
    this.roleService = null;
  }

  async initialize() {
    try {
      // Initialize database
      logger.info('Initializing database connection...');
      await initializeDatabase();

      // Initialize services
      logger.info('Initializing services...');
      this.videoService = new VideoService();
      this.channelManager = new ChannelManager(this.io);
      this.roleService = new RoleService();
      await this.channelManager.initialize();

      // Register services with Express app for API access
      this.app.set('channelManager', this.channelManager);
      this.app.set('videoService', this.videoService);
      this.app.set('roleService', this.roleService);

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup Socket.io
      this.setupSocket();

      // Initialize Twitch bot
      await this.initializeTwitchBot();

      logger.info('Server initialization complete');
    } catch (error) {
      logger.error('Server initialization failed:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Disable ETag to avoid 304 caching issues on auth endpoints
    this.app.set('etag', false);
    // Honor proxy headers (required for rate limiter / deployments behind proxy)
    this.app.set('trust proxy', process.env.TRUST_PROXY || 1);

    // Security middleware
    this.app.use(helmet({
      // Allow embedding 3rd-party content like YouTube
      crossOriginEmbedderPolicy: false,
      // Allow loading cross-origin resources we explicitly permit via CSP (e.g., fonts)
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          // Base policy
          defaultSrc: ["'self'"],

          // Allow styles from self and Google Fonts
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],

          // Scripts needed for YouTube IFrame API
          scriptSrc: [
            "'self'",
            'https://www.youtube.com',
            'https://s.ytimg.com',
            'https://www.gstatic.com'
          ],

          // Images may come from HTTPS and data URIs
          imgSrc: ["'self'", 'data:', 'https:'],

          // Permit audio/media from same-origin and HTTPS (for hosted uploads/CDN)
          mediaSrc: ["'self'", 'https:'],

          // Fonts from Google Fonts and data URIs
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],

          // Permit WebSocket and HTTPS connections (API + Socket.io)
          connectSrc: ["'self'", 'https:', 'wss:'],

          // Allow embedding YouTube iframes
          frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com']
        },
      },
    }));

    // CORS
    const expressCorsOrigin = this.allowedOrigins.length ? this.allowedOrigins : true;
    this.app.use(cors({
      origin: expressCorsOrigin,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
      max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
      message: {
        error: 'Too many requests from this IP, please try again later.'
      }
    });
    this.app.use('/api/', limiter);

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Prevent caching for API responses (important for auth state)
    this.app.use('/api', (req, res, next) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      next();
    });

    // Session configuration
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }));

    // Initialize Passport
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        bot: this.bot ? this.bot.isConnected() : false,
        channels: this.channelManager ? this.channelManager.getActiveChannels().length : 0
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api', apiRoutes);

    // Serve uploaded assets (audio, etc.).
    const uploadsDir = process.env.UPLOADS_DIR
      ? path.resolve(process.env.UPLOADS_DIR)
      : path.join(__dirname, '../uploads');
    // Use fallthrough: false so missing files return 404 instead of SPA index.html
    this.app.use('/uploads', express.static(uploadsDir, { fallthrough: false }));
    try {
      logger.info('Serving /uploads from', { uploadsDir });
    } catch (_) {}

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static('public'));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
      });
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    // Error handler (respect status from upstream middleware like express.static)
    this.app.use((err, req, res, next) => {
      const status = err.status || err.statusCode || (err.code === 'ENOENT' ? 404 : 500);
      if (status >= 500) {
        logger.error('Unhandled error:', err);
      } else {
        logger.warn('Handled error:', { status, message: err.message, path: req.path });
      }
      res.status(status).json({
        error: process.env.NODE_ENV === 'production' && status >= 500
          ? 'Internal server error'
          : err.message
      });
    });
  }

  setupSocket() {
    socketHandler(this.io, this.channelManager);
    logger.info('Socket.io server configured');
  }

  async initializeTwitchBot() {
    if (!process.env.TWITCH_BOT_USERNAME || !process.env.TWITCH_BOT_OAUTH_TOKEN) {
      logger.warn('Twitch bot credentials not provided, bot will not start');
      return;
    }

    try {
      this.bot = new TwitchBot(this.channelManager, this.io);
      await this.bot.initialize();
      
      // Register bot with Express app for API access
      this.app.set('bot', this.bot);
      
      logger.info('Twitch bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Twitch bot:', error);
      // Don't fail server startup if bot fails
    }
  }

  async start() {
    await this.initialize();
    
    this.server.listen(this.port, () => {
      logger.info(`Server running on port ${this.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    }).on('error', (err) => {
      logger.error('Failed to start server:', err);
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${this.port} is already in use`);
      }
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  async shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Close Twitch bot connection
      if (this.bot) {
        await this.bot.disconnect();
      }

      // Close server
      this.server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown');
        process.exit(1);
      }, 10000);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = Server;
