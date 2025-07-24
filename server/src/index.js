const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const { initializeDatabase } = require('./database/connection');
const apiRoutes = require('./api');
const socketHandler = require('./socket');
const TwitchBot = require('./bot/TwitchBot');
const QueueService = require('./services/QueueService');
const VideoService = require('./services/VideoService');

class Server {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    this.port = process.env.PORT || 5000;
    this.bot = null;
    this.queueService = null;
  }

  async initialize() {
    try {
      // Initialize database
      logger.info('Initializing database connection...');
      await initializeDatabase();

      // Initialize services
      logger.info('Initializing services...');
      this.videoService = new VideoService();
      this.queueService = new QueueService(this.io);
      await this.queueService.initialize();

      // Register services with Express app for API access
      this.app.set('queueService', this.queueService);
      this.app.set('videoService', this.videoService);

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
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
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

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        bot: this.bot ? this.bot.isConnected() : false
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api', apiRoutes);

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

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : err.message
      });
    });
  }

  setupSocket() {
    socketHandler(this.io, this.queueService);
    logger.info('Socket.io server configured');
  }

  async initializeTwitchBot() {
    if (!process.env.TWITCH_USERNAME || !process.env.TWITCH_OAUTH_TOKEN || !process.env.TWITCH_CHANNEL) {
      logger.warn('Twitch bot credentials not provided, bot will not start');
      return;
    }

    try {
      this.bot = new TwitchBot(this.queueService, this.io);
      await this.bot.initialize();
      
      // Register bot with Express app for API access
      this.app.set('bot', this.bot);
      
      logger.info('Twitch bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Twitch bot:', error);
    }
  }

  async start() {
    await this.initialize();
    
    this.server.listen(this.port, () => {
      logger.info(`Server running on port ${this.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
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
