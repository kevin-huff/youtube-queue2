const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

let prisma = null;

const initializeDatabase = async () => {
  try {
    if (!prisma) {
      prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
        errorFormat: 'pretty',
      });

      // Connect to database
      await prisma.$connect();
      logger.info('Database connected successfully');

      // Initialize default settings if they don't exist
      await initializeDefaultSettings();
    }

    return prisma;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const initializeDefaultSettings = async () => {
  try {
    const defaultSettings = [
      { key: 'queue_enabled', value: 'false' },
      { key: 'max_queue_size', value: process.env.MAX_QUEUE_SIZE || '50' },
      { key: 'submission_cooldown', value: process.env.SUBMISSION_COOLDOWN || '30' },
      { key: 'max_video_duration', value: process.env.MAX_VIDEO_DURATION || '600' },
      { key: 'auto_play_next', value: process.env.AUTO_PLAY_NEXT || 'true' },
      { key: 'current_volume', value: '75' }
    ];

    for (const setting of defaultSettings) {
      await prisma.botSetting.upsert({
        where: { key: setting.key },
        update: {},
        create: setting
      });
    }

    logger.info('Default bot settings initialized');
  } catch (error) {
    logger.error('Failed to initialize default settings:', error);
    throw error;
  }
};

const getDatabase = () => {
  if (!prisma) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return prisma;
};

const closeDatabase = async () => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Database connection closed');
  }
};

// Graceful shutdown handler
process.on('beforeExit', async () => {
  await closeDatabase();
});

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase
};
