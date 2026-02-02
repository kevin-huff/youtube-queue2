const { PrismaClient } = require('@prisma/client');
const { generateJudgeToken, verifyJudgeToken } = require('../../../src/auth/judgeToken');

const getDatabaseUrl = () => {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) for integration tests');
  }
  return url;
};

const createPrismaClient = () => {
  const url = getDatabaseUrl();
  return new PrismaClient({
    datasources: { db: { url } }
  });
};

const tableExists = async (prisma, tableName) => {
  const result = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS present
  `;
  return Array.isArray(result) && result[0] && result[0].present === true;
};

/**
 * Bring the test database up to the minimal schema expected by Prisma.
 * This is intentionally lightweight so local devs can run integration tests
 * even if their test DB missed a migration.
 */
const ensureTestSchema = async (prisma) => {
  const hasInvites = await tableExists(prisma, 'channel_role_invites');
  if (!hasInvites) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "channel_role_invites" (
        "id" SERIAL PRIMARY KEY,
        "channel_id" TEXT,
        "invited_username" TEXT,
        "role" TEXT,
        "cup_id" TEXT,
        "assigned_by" TEXT,
        "note" TEXT,
        "expires_at" TIMESTAMPTZ,
        "accepted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }

  const accountColumns = [
    'twitch_access_token TEXT',
    'twitch_refresh_token TEXT',
    'twitch_token_expires_at TIMESTAMPTZ',
    'twitch_token_scope TEXT',
    'profile_image_url TEXT'
  ];
  for (const col of accountColumns) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS ${col};`);
  }
};

// Truncate tables in FK-safe order for the test schema
const resetDatabase = async (prisma) => {
  const tasks = [
    prisma.judgeScore.deleteMany(),
    prisma.judgeSession.deleteMany(),
    prisma.cupStanding.deleteMany(),
    prisma.seriesStanding.deleteMany(),
    prisma.channelRoleAssignment.deleteMany(),
    'channel_role_invites',
    prisma.queueItem.deleteMany(),
    prisma.submissionLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.cup.deleteMany(),
    prisma.series.deleteMany(),
    prisma.botSetting.deleteMany(),
    prisma.channelOwner.deleteMany(),
    prisma.channel.deleteMany(),
    prisma.account.deleteMany()
  ];

  const deletions = [];
  for (const task of tasks) {
    if (typeof task === 'string') {
      const exists = await tableExists(prisma, task);
      if (exists && prisma.channelRoleInvite) {
        deletions.push(prisma.channelRoleInvite.deleteMany());
      }
      continue;
    }
    deletions.push(task);
  }

  await prisma.$transaction(deletions);
};

const seedBasicCup = async (prisma, options = {}) => {
  const account = await prisma.account.create({
    data: {
      id: options.accountId || undefined,
      username: options.accountUsername || 'owner1',
      displayName: options.accountDisplayName || 'Owner One',
      twitchId: options.accountTwitchId || null
    }
  });

  const channel = await prisma.channel.create({
    data: {
      id: 'test_channel',
      displayName: 'Test Channel',
      twitchUserId: '12345',
      profileImageUrl: null,
      isActive: true,
      settings: {}
    }
  });

  await prisma.channelOwner.create({
    data: {
      accountId: account.id,
      channelId: channel.id,
      role: 'OWNER'
    }
  });

  const user = await prisma.user.create({
    data: {
      twitchUsername: 'submitter1',
      channelId: channel.id,
      role: 'VIEWER'
    }
  });

  const cup = await prisma.cup.create({
    data: {
      channelId: channel.id,
      title: 'Test Cup',
      slug: 'test-cup',
      status: 'LIVE',
      isActive: true
    }
  });

  const queueItems = await prisma.$transaction([
    prisma.queueItem.create({
      data: {
        channelId: channel.id,
        videoUrl: 'https://youtube.com/watch?v=abc123',
        videoId: 'abc123',
        platform: 'YOUTUBE',
        title: 'Video A',
        duration: 120,
        submitterUsername: user.twitchUsername,
        status: 'PENDING',
        position: 1,
        cupId: cup.id,
        moderationStatus: 'APPROVED'
      }
    }),
    prisma.queueItem.create({
      data: {
        channelId: channel.id,
        videoUrl: 'https://youtube.com/watch?v=def456',
        videoId: 'def456',
        platform: 'YOUTUBE',
        title: 'Video B',
        duration: 90,
        submitterUsername: user.twitchUsername,
        status: 'PENDING',
        position: 2,
        cupId: cup.id,
        moderationStatus: 'APPROVED'
      }
    })
  ]);

  const token = generateJudgeToken({
    channelId: channel.id,
    cupId: cup.id,
    judgeName: 'Judge One',
    expiresIn: '1d'
  });
  const decoded = verifyJudgeToken(token);

  return {
    prisma,
    account,
    channel,
    user,
    cup,
    queueItems,
    judgeToken: token,
    judgeId: decoded?.judgeId
  };
};

module.exports = {
  createPrismaClient,
  resetDatabase,
  ensureTestSchema,
  seedBasicCup
};
