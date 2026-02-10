// @ts-nocheck
import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma';
import { redisConnection } from '../config/queue';
import { decrypt } from '../utils/crypto';
import { ImapFlow } from 'imapflow';

interface WarmupJobData {
  accountId: string;
}

// Warmup conversation topics for generating natural emails
const WARMUP_TOPICS = [
  'project update', 'meeting follow-up', 'quarterly review', 'team sync',
  'product feedback', 'client proposal', 'budget discussion', 'timeline update',
  'strategy session', 'partnership opportunity', 'market research', 'training schedule',
  'office renovation', 'tech stack decision', 'hiring update', 'event planning',
  'vendor evaluation', 'process improvement', 'customer feedback', 'goal setting',
];

const WARMUP_SUBJECTS = [
  'Quick update on {topic}', 'Re: {topic}', 'Following up on {topic}',
  'Thoughts on {topic}?', '{topic} - next steps', 'FYI: {topic}',
  'Check in: {topic}', 'Update: {topic}', 'Question about {topic}',
];

const WARMUP_BODIES = [
  'Hi,\n\nJust wanted to follow up on our discussion about {topic}. I think we\'re making great progress. Let me know if you need anything from my side.\n\nBest regards',
  'Hey,\n\nI\'ve been thinking about {topic} and wanted to share some thoughts. Would love to get your perspective on this when you have a moment.\n\nThanks!',
  'Hi there,\n\nHope you\'re doing well! I wanted to touch base regarding {topic}. Everything is on track from our end. Let me know if you have any questions.\n\nCheers',
  'Hello,\n\nQuick note about {topic} — I\'ve reviewed the latest updates and things are looking good. Happy to discuss further if needed.\n\nBest',
  'Hi,\n\nJust a heads up about {topic}. We\'ve made some good headway this week. I\'ll send a more detailed update soon.\n\nThanks!',
];

function generateWarmupEmail() {
  const topic = WARMUP_TOPICS[Math.floor(Math.random() * WARMUP_TOPICS.length)];
  const subjectTemplate = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
  const bodyTemplate = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];

  return {
    subject: subjectTemplate.replace('{topic}', topic),
    body: bodyTemplate.replace('{topic}', topic),
  };
}

/**
 * Calculate warmup daily limit based on slow ramp
 */
function getWarmupDailyLimit(account: any): number {
  if (!account.warmupStartedAt) return 2;

  const daysSinceStart = Math.floor(
    (Date.now() - account.warmupStartedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Slow ramp: Day 1=2, Day 2=4, Day 3=6, ... up to configured limit
  const rampedLimit = Math.min(2 + daysSinceStart * 2, account.warmupDailyLimit);
  return Math.max(2, rampedLimit);
}

/**
 * Move email from spam to inbox (read emulation)
 */
async function moveFromSpamToInbox(account: any, messageId: string) {
  if (!account.imapHost || !account.imapPass) return;

  try {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort || 993,
      secure: account.imapSecure !== false,
      auth: {
        user: account.imapUser || account.email,
        pass: decrypt(account.imapPass),
      },
      logger: false,
    });

    await client.connect();

    // Check spam folder
    const spamFolders = ['[Gmail]/Spam', 'Junk', 'Spam', 'Junk E-mail', 'Junk Email'];

    for (const folder of spamFolders) {
      try {
        const lock = await client.getMailboxLock(folder);
        try {
          const msg = await client.search({ header: { 'Message-ID': messageId } });
          if (msg.length > 0) {
            // Move to inbox
            await client.messageMove(msg, 'INBOX');
            // Mark as read
            await client.messageFlagsAdd(msg, ['\\Seen']);
            console.log(`Moved warmup email from ${folder} to INBOX for ${account.email}`);
            break;
          }
        } finally {
          lock.release();
        }
      } catch (e) {
        // Folder doesn't exist, try next
      }
    }

    // Also mark inbox emails as read (read emulation)
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const msg = await client.search({
          header: { 'Message-ID': messageId },
          seen: false,
        });
        if (msg.length > 0) {
          await client.messageFlagsAdd(msg, ['\\Seen']);
        }
      } finally {
        lock.release();
      }
    } catch (e) {
      // Ignore
    }

    await client.logout();
  } catch (error) {
    console.error(`IMAP error for ${account.email}:`, error);
  }
}

/**
 * Process warmup for a single account
 */
async function processWarmup(job: Job<WarmupJobData>) {
  const { accountId } = job.data;

  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account || !account.warmupEnabled) return;

  // Check weekdays only
  if (account.warmupWeekdaysOnly) {
    const day = new Date().getDay();
    if (day === 0 || day === 6) return;
  }

  const dailyLimit = getWarmupDailyLimit(account);

  // Get today's warmup count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sentToday = await prisma.warmupEmail.count({
    where: {
      accountId,
      direction: 'SENT',
      sentAt: { gte: today },
    },
  });

  if (sentToday >= dailyLimit) return;

  // Find warmup partners (other accounts with warmup enabled)
  const partners = await prisma.emailAccount.findMany({
    where: {
      warmupEnabled: true,
      id: { not: accountId },
      isActive: true,
    },
    take: dailyLimit - sentToday,
  });

  if (partners.length === 0) {
    console.log(`No warmup partners available for ${account.email}`);
    return;
  }

  for (const partner of partners) {
    try {
      const { subject, body } = generateWarmupEmail();

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: account.smtpHost!,
        port: account.smtpPort || 587,
        secure: account.smtpSecure,
        auth: {
          user: account.smtpUser || account.email,
          pass: decrypt(account.smtpPass!),
        },
      });

      const info = await transporter.sendMail({
        from: `${account.displayName || account.email} <${account.email}>`,
        to: partner.email,
        subject,
        text: body,
      });

      // Log warmup email
      await prisma.warmupEmail.create({
        data: {
          accountId: account.id,
          partnerEmail: partner.email,
          direction: 'SENT',
          subject,
          body,
          messageId: info.messageId,
        },
      });

      // Schedule partner to receive and interact
      // (reply, mark as read, move from spam)
      setTimeout(async () => {
        try {
          // Move from spam if needed
          await moveFromSpamToInbox(partner, info.messageId);

          // Decide if should reply based on reply rate
          const shouldReply = Math.random() * 100 < account.warmupReplyRate;

          if (shouldReply && partner.smtpHost && partner.smtpPass) {
            const replyTransporter = nodemailer.createTransport({
              host: partner.smtpHost!,
              port: partner.smtpPort || 587,
              secure: partner.smtpSecure,
              auth: {
                user: partner.smtpUser || partner.email,
                pass: decrypt(partner.smtpPass!),
              },
            });

            const replyBody = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)]
              .replace('{topic}', 'your message');

            await replyTransporter.sendMail({
              from: partner.email,
              to: account.email,
              subject: `Re: ${subject}`,
              text: replyBody,
              inReplyTo: info.messageId,
            });

            // Log reply
            await prisma.warmupEmail.create({
              data: {
                accountId: partner.id,
                partnerEmail: account.email,
                direction: 'SENT',
                subject: `Re: ${subject}`,
                body: replyBody,
                replied: true,
              },
            });

            // Move the reply from spam too
            setTimeout(async () => {
              await moveFromSpamToInbox(account, info.messageId);
            }, 30000 + Math.random() * 60000);
          }
        } catch (e) {
          console.error('Warmup reply error:', e);
        }
      }, 60000 + Math.random() * 300000); // 1-6 minutes delay

      console.log(`Warmup email sent: ${account.email} → ${partner.email}`);

    } catch (error: any) {
      console.error(`Warmup send failed ${account.email}:`, error.message);
    }
  }

  // Update deliverability score
  const totalWarmup = await prisma.warmupEmail.count({
    where: { accountId },
  });
  const movedFromSpam = await prisma.warmupEmail.count({
    where: { accountId, movedFromSpam: true },
  });
  const score = totalWarmup > 0 ? ((1 - movedFromSpam / totalWarmup) * 100) : 50;

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: { deliverabilityScore: Math.round(score * 10) / 10 },
  });
}

// Create worker
const warmupWorker = new Worker('warmup', processWarmup, {
  connection: redisConnection,
  concurrency: 3,
});

warmupWorker.on('completed', (job) => {
  console.log(`Warmup job ${job.id} completed`);
});

warmupWorker.on('failed', (job, err) => {
  console.error(`Warmup job ${job?.id} failed:`, err);
});

// Schedule warmup for all enabled accounts
async function scheduleWarmups() {
  const { warmupQueue } = await import('../config/queue');

  const accounts = await prisma.emailAccount.findMany({
    where: { warmupEnabled: true, isActive: true },
    select: { id: true },
  });

  for (const account of accounts) {
    await warmupQueue.add(
      'warmup-account',
      { accountId: account.id },
      {
        repeat: {
          every: 3600000, // Every hour
        },
        jobId: `warmup-${account.id}`,
      }
    );
  }

  console.log(`Scheduled warmup for ${accounts.length} accounts`);
}

scheduleWarmups().catch(console.error);

export default warmupWorker;
console.log('Warmup worker started');
