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

    // Dynamic meta routes for rich previews on shareable pages
    const CLIENT_URL = process.env.CLIENT_URL || '';
    const readBaseIndex = () => {
      try {
        const fs = require('fs');
        const p = path.join(__dirname, '../public/index.html');
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf8');
        }
      } catch (_) {}
      // Minimal fallback
      return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FREE* Mediashare</title></head><body><div id="root"></div></body></html>';
    };

    const injectMeta = (html, tags = []) => {
      if (!html || !tags.length) return html;
      const headClose = '</head>';
      const idx = html.indexOf(headClose);
      const metaStr = tags.join('\n');
      if (idx !== -1) {
        return html.slice(0, idx) + '\n' + metaStr + '\n' + html.slice(idx);
      }
      return metaStr + html;
    };

    const metaTags = ({ title, desc, url, image, type = 'website', extra = [] }) => {
      const safe = (s) => (typeof s === 'string' ? s : '')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const tags = [
        `<title>${safe(title || 'FREE* Mediashare')}</title>`,
        `<meta name="description" content="${safe(desc || '')}">`,
        `<meta property="og:type" content="${safe(type)}">`,
        `<meta property="og:title" content="${safe(title || '')}">`,
        `<meta property="og:description" content="${safe(desc || '')}">`,
        url ? `<meta property="og:url" content="${safe(url)}">` : '',
        image ? `<meta property="og:image" content="${safe(image)}">` : '',
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${safe(title || '')}">`,
        `<meta name="twitter:description" content="${safe(desc || '')}">`,
        image ? `<meta name="twitter:image" content="${safe(image)}">` : ''
      ].filter(Boolean);
      return tags.concat(extra);
    };

    const renderWithMeta = async (buildMeta) => {
      const base = readBaseIndex();
      const tags = await buildMeta();
      return injectMeta(base, tags);
    };

    // Lightweight dynamic OG image generator (SVG)
    const ogSvg = ({ title = 'FREE* Mediashare', subtitle = '', accent = '#9146ff' } = {}) => {
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0b0d"/>
      <stop offset="100%" stop-color="#16161a"/>
    </linearGradient>
    <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#00f0ff" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <circle cx="1050" cy="-50" r="350" fill="url(#g2)"/>
  <circle cx="-80" cy="650" r="420" fill="url(#g2)"/>
  <g transform="translate(80, 180)">
    <text x="0" y="0" font-family="Inter, Arial, Helvetica, sans-serif" font-size="70" fill="#ffffff" font-weight="800">
      ${esc(title)}
    </text>
    <text x="0" y="70" font-family="Inter, Arial, Helvetica, sans-serif" font-size="34" fill="#d2ccff" opacity="0.9">
      ${esc(subtitle)}
    </text>
  </g>
  <text x="80" y="560" font-family="Inter, Arial, Helvetica, sans-serif" font-size="24" fill="#9aa0aa" opacity="0.9">FREE* Mediashare • KevNetCloud × ChatGPT</text>
</svg>`;
    };

    // OG image routes (SVG)
    this.app.get('/og/u/:username.svg', async (req, res) => {
      try {
        const username = (req.params.username || '').toLowerCase();
        const [items, groups] = await Promise.all([
          this.channelManager.prisma.queueItem.count({
            where: {
              submitterUsername: { equals: username, mode: 'insensitive' },
              judgeScores: { some: {} }
            }
          }),
          this.channelManager.prisma.queueItem.groupBy({
            by: ['cupId'],
            where: {
              submitterUsername: { equals: username, mode: 'insensitive' },
              judgeScores: { some: {} },
              cupId: { not: null }
            },
            _count: { _all: true }
          }).catch(() => [])
        ]);
        const cupCount = Array.isArray(groups) ? groups.length : 0;
        const svg = ogSvg({
          title: `@${username} — Submitter Profile`,
          subtitle: `${items} rated video${items === 1 ? '' : 's'} • ${cupCount} cup${cupCount === 1 ? '' : 's'}`,
          accent: '#ff1cf7'
        });
        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'public, max-age=600');
        return res.send(svg);
      } catch (err) {
        const svg = ogSvg({ title: 'Submitter Profile', subtitle: 'Rated videos across cups', accent: '#ff1cf7' });
        res.set('Content-Type', 'image/svg+xml');
        res.status(200).send(svg);
      }
    });

    this.app.get('/og/channel/:channelName/:kind.svg', async (req, res) => {
      try {
        const channelName = (req.params.channelName || '').toLowerCase();
        const kind = (req.params.kind || '').toLowerCase();
        const info = await this.channelManager.getChannelInfo(channelName);
        const display = info?.displayName || channelName;
        const map = {
          viewer: 'Viewer Hub',
          queue: 'Submit to the Queue',
          'queue-overlay': 'Queue Overlay',
          leaderboard: 'Live Leaderboard',
          player: 'Synchronized Player',
          judge: 'Judge Console',
          cups: 'Cup Admin'
        };
        const subtitle = map[kind] || 'Channel';
        const svg = ogSvg({ title: `${display}`, subtitle, accent: '#00f0ff' });
        res.set('Content-Type', 'image/svg+xml');
        res.set('Cache-Control', 'public, max-age=600');
        return res.send(svg);
      } catch (err) {
        const svg = ogSvg({ title: 'FREE* Mediashare', subtitle: 'KevNetCloud × ChatGPT', accent: '#00f0ff' });
        res.set('Content-Type', 'image/svg+xml');
        res.status(200).send(svg);
      }
    });

    // Public share pages
    this.app.get([
      '/u/:username',
      '/viewer/:channelName',
      '/channel/:channelName',
      '/overlay/:channelName/leaderboard',
      '/overlay/:channelName/queue',
      '/player/:channelName',
      '/judge/:channelName/:cupId',
      '/judge/:channelName/:cupId/overlay',
      '/channel/:channelName/cups'
    ], async (req, res, next) => {
      try {
        const channelManager = this.channelManager;
        const baseUrl = CLIENT_URL || `${req.protocol}://${req.get('host')}`;
        const fullUrl = baseUrl + req.originalUrl;

        // Submitter profile: /u/:username
        if (req.path.startsWith('/u/')) {
          const username = (req.params.username || '').toLowerCase();
          // Count rated videos + cups
          const [items, groups] = await Promise.all([
            channelManager.prisma.queueItem.count({
              where: {
                submitterUsername: { equals: username, mode: 'insensitive' },
                judgeScores: { some: {} }
              }
            }),
            channelManager.prisma.queueItem.groupBy({
              by: ['cupId'],
              where: {
                submitterUsername: { equals: username, mode: 'insensitive' },
                judgeScores: { some: {} },
                cupId: { not: null }
              },
              _count: { _all: true }
            }).catch(() => [])
          ]);
          const cupCount = Array.isArray(groups) ? groups.length : 0;
          const title = `${username} — Submitter Profile (${items} rated videos across ${cupCount} cup${cupCount === 1 ? '' : 's'})`;
          const desc = `See ${username}'s rated videos, judges’ scores, and standings across cups.`;
          const img = `${baseUrl}/og/u/${encodeURIComponent(username)}.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        // Channel viewer hub / overlay meta
        const channelName = (req.params.channelName || '').toLowerCase();
        const channel = await channelManager.getChannelInfo(channelName);
        const imageFallback = `${baseUrl}/logo192.png`;
        const image = channel?.profileImageUrl || imageFallback;

        if (req.path.startsWith('/viewer/')) {
          const title = `${channel?.displayName || channelName} — Viewer Hub`;
          const desc = `Live cups, queue status, standings, and more for ${channel?.displayName || channelName}.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/viewer.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        if (req.path.startsWith('/channel/')) {
          const title = `Submit to ${channel?.displayName || channelName}`;
          const desc = `Drop your best videos into ${channel?.displayName || channelName}'s mediashare queue.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/queue.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        if (req.path.includes('/overlay/leaderboard')) {
          const title = `${channel?.displayName || channelName} — Live Leaderboard Overlay`;
          const desc = `Realtime standings overlay for ${channel?.displayName || channelName}.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/leaderboard.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image, type: 'video.other' });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        if (req.path.includes('/overlay/queue')) {
          const title = `${channel?.displayName || channelName} — Live Queue Overlay`;
          const desc = `Queue overlay for ${channel?.displayName || channelName}: what’s playing and what’s next.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/queue-overlay.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image, type: 'video.other' });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        if (req.path.startsWith('/player/')) {
          const title = `${channel?.displayName || channelName} — Player`;
          const desc = `Synchronized YouTube player for ${channel?.displayName || channelName}.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/player.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image, type: 'video.movie' });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        if (req.path.startsWith('/judge/')) {
          const title = `${channel?.displayName || channelName} — Judge Console`;
          const desc = `Score videos live for cup ${req.params.cupId}. Lock in your vote, reveal the average, and help shape the standings.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/judge.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image, type: 'website' });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        if (req.path.startsWith('/channel/') && req.path.endsWith('/cups')) {
          const title = `${channel?.displayName || channelName} — Cup Admin`;
          const desc = `Manage cups, assign videos, and control the live show.`;
          const img = `${baseUrl}/og/channel/${encodeURIComponent(channelName)}/cups.svg`;
          const tags = metaTags({ title, desc, url: fullUrl, image: img || image });
          const html = await renderWithMeta(() => Promise.resolve(tags));
          return res.send(html);
        }

        return next();
      } catch (err) {
        logger.warn('Dynamic meta route failed; falling back to static', { error: err?.message });
        return next();
      }
    });

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
