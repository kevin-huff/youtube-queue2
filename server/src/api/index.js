const express = require('express');
const logger = require('../utils/logger');
const helpers = require('./helpers');

const router = express.Router();

// Register route modules
require('./auth.routes')(router, { helpers });
require('./admin.routes')(router, { helpers });
require('./channels.routes')(router, { helpers });
require('./cups.routes')(router, { helpers });
require('./queue.routes')(router, { helpers });
require('./settings.routes')(router, { helpers });
require('./judge.routes')(router, { helpers });
require('./voting.routes')(router, { helpers });
require('./roles.routes')(router, { helpers });
require('./health.routes')(router, { helpers });

// Global API error handler
router.use((error, req, res, _next) => {
  logger.error('API Error:', error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
});

module.exports = router;
