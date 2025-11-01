#!/usr/bin/env node

/**
 * Test script for Phase 2 Judge functionality
 * 
 * This script will:
 * 1. Create a test cup
 * 2. Add some videos to the queue
 * 3. Assign videos to the cup
 * 4. Print URLs for testing the judge interface
 */

const { PrismaClient } = require('@prisma/client');
const { generateJudgeToken } = require('./src/auth/judgeToken');
const prisma = new PrismaClient();

async function main() {
  console.log('🎬 Setting up Phase 2 Judge Test Environment\n');

  // 1. Find or create a test channel
  const testChannelId = 'test_channel'; // Replace with your channel
  
  let channel = await prisma.channel.findUnique({
    where: { id: testChannelId }
  });

  if (!channel) {
    console.log(`Creating test channel: ${testChannelId}`);
    channel = await prisma.channel.create({
      data: {
        id: testChannelId,
        displayName: 'Test Channel',
        isActive: true
      }
    });
  }

  // 2. Create a test cup
  console.log('\n📋 Creating test cup...');
  const cup = await prisma.cup.create({
    data: {
      channelId: testChannelId,
      title: 'Test Gameshow Cup',
      slug: `test-cup-${Date.now()}`,
      theme: 'Testing Phase 2 Judge Features',
      status: 'LIVE'
    }
  });
  console.log(`✅ Cup created: ${cup.title} (ID: ${cup.id})`);

  // 3. Create test users
  console.log('\n👥 Creating test users...');
  const testUsers = ['testuser1', 'testuser2', 'testuser3'];
  for (const username of testUsers) {
    await prisma.user.upsert({
      where: {
        twitchUsername_channelId: {
          twitchUsername: username,
          channelId: testChannelId
        }
      },
      update: {},
      create: {
        twitchUsername: username,
        channelId: testChannelId,
        role: 'CONTESTANT'
      }
    });
  }
  console.log(`✅ Created ${testUsers.length} test users`);

  // 4. Create test queue items
  console.log('\n🎥 Creating test queue items...');
  const testVideos = [
    {
      videoId: 'test_vid_1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Test Video 1',
      platform: 'YOUTUBE',
      submitter: testUsers[0]
    },
    {
      videoId: 'test_vid_2',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Test Video 2',
      platform: 'YOUTUBE',
      submitter: testUsers[1]
    },
    {
      videoId: 'test_vid_3',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Test Video 3',
      platform: 'YOUTUBE',
      submitter: testUsers[2]
    }
  ];

  const queueItems = [];
  for (let i = 0; i < testVideos.length; i++) {
    const video = testVideos[i];
    const item = await prisma.queueItem.create({
      data: {
        channelId: testChannelId,
        videoId: video.videoId,
        videoUrl: video.url,
        title: video.title,
        platform: video.platform,
        submitterUsername: video.submitter,
        position: i + 1,
        status: 'APPROVED',
        cupId: cup.id
      }
    });
    queueItems.push(item);
  }
  console.log(`✅ Created ${queueItems.length} queue items and assigned to cup`);

  // 5. Generate judge tokens
  console.log('\n🔑 Generating judge tokens...');
  const judgeTokens = [];
  const judgeNames = ['Judge Alice', 'Judge Bob', 'Judge Charlie'];
  
  for (const judgeName of judgeNames) {
    const token = generateJudgeToken({
      channelId: testChannelId,
      cupId: cup.id,
      judgeName,
      expiresIn: '7d'
    });
    judgeTokens.push({ name: judgeName, token });
  }
  console.log(`✅ Generated ${judgeTokens.length} judge tokens`);

  // 6. Print test information
  console.log('\n\n🎯 TEST ENVIRONMENT READY!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Channel: ${testChannelId}`);
  console.log(`Cup ID: ${cup.id}`);
  console.log(`Cup Title: ${cup.title}`);
  console.log(`Status: ${cup.status}`);
  console.log('═══════════════════════════════════════════════════\n');

  console.log('📍 JUDGE PAGE URLS (with tokens):\n');
  judgeTokens.forEach((judge, idx) => {
    const url = `http://localhost:3000/judge/${testChannelId}/${cup.id}?token=${judge.token}`;
    console.log(`   ${idx + 1}. ${judge.name}:`);
    console.log(`      ${url}\n`);
  });

  console.log('📦 Queue Items:');
  queueItems.forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.title} (ID: ${item.id}) - by ${item.submitterUsername}`);
  });

  console.log('\n💡 NEXT STEPS:');
  console.log('   1. Start the server: cd server && npm start');
  console.log('   2. Start the client: cd client && npm start');
  console.log('   3. Open any of the Judge Page URLs above (no login required!)');
  console.log('   4. Each URL represents a different judge');
  console.log('   5. Test the scoring workflow!\n');

  console.log('🧪 The tokens are valid for 7 days and grant access without Twitch authentication');
  console.log('   Each token is unique to a specific judge and cup\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
