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

      // Default per-channel settings are handled during channel creation
    }

    return prisma;
  } catch (error) {
    logger.error('Database connection failed:', error);
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
