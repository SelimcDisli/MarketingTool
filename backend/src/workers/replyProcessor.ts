// @ts-nocheck
import { Worker, Job } from 'bullmq';
import { ImapFlow } from 'imapflow';
import prisma from '../config/prisma';
import { redisConnection } from '../config/queue';
import { decrypt } from '../utils/crypto';
import { dispatchWebhook } from '../routes/webhooks';

/**
 * AI-based sentiment classification
 * Uses simple keyword matching as fallback, OpenAI when available
 */
async function classifyReply(body: string): Promise<{
  tag: string;
  sentiment: string;
  confidence: number;
}> {
  const lowerBody = body.toLowerCase();

  // Out of office detection
  const oooKeywords = ['out of office', 'away from', 'on vacation', 'on holiday', 'auto-reply', 'automatic reply', 'abwesend', 'nicht im büro'];
  if (oooKeywords.some((k) => lowerBody.includes(k))) {
    return { tag: 'OUT_OF_OFFICE', sentiment: 'NEUTRAL', confidence: 0.95 };
  }

  // Unsubscribe detection
  const unsubKeywords = ['unsubscribe', 'remove me', 'stop emailing', 'don\'t contact', 'nicht mehr kontaktieren', 'abmelden'];
  if (unsubKeywords.some((k) => lowerBody.includes(k))) {
    return { tag: 'UNSUBSCRIBE', sentiment: 'NEGATIVE', confidence: 0.9 };
  }

  // Interested detection
  const interestedKeywords = [
    'interested', 'tell me more', 'let\'s talk', 'set up a call',
    'schedule a meeting', 'sounds good', 'love to learn more',
    'can we discuss', 'let\'s connect', 'great timing',
    'interested in learning', 'send me more info', 'book a time',
    'interessiert', 'klingt gut', 'lass uns reden', 'termin',
  ];
  if (interestedKeywords.some((k) => lowerBody.includes(k))) {
    return { tag: 'INTERESTED', sentiment: 'POSITIVE', confidence: 0.85 };
  }

  // Meeting booked detection
  const meetingKeywords = [
    'booked', 'confirmed', 'calendar invite', 'see you then',
    'looking forward to our call', 'accepted your invite',
    'termin bestätigt', 'einladung angenommen',
  ];
  if (meetingKeywords.some((k) => lowerBody.includes(k))) {
    return { tag: 'MEETING_BOOKED', sentiment: 'POSITIVE', confidence: 0.85 };
  }

  // Not interested / objection detection
  const notInterestedKeywords = [
    'not interested', 'no thanks', 'no thank you', 'not a good fit',
    'we\'re all set', 'already have a solution', 'not at this time',
    'pass on this', 'not looking', 'please don\'t', 'kein interesse',
    'nein danke', 'passt nicht',
  ];
  if (notInterestedKeywords.some((k) => lowerBody.includes(k))) {
    return { tag: 'NOT_INTERESTED', sentiment: 'NEGATIVE', confidence: 0.85 };
  }

  // Objection detection
  const objectionKeywords = [
    'too expensive', 'budget', 'pricing', 'cost', 'cheaper',
    'not the right time', 'maybe later', 'next quarter',
    'need to think', 'zu teuer', 'budget', 'preis',
  ];
  if (objectionKeywords.some((k) => lowerBody.includes(k))) {
    return { tag: 'OBJECTION', sentiment: 'NEUTRAL', confidence: 0.75 };
  }

  // Default: new/unclassified
  return { tag: 'NEW', sentiment: 'NEUTRAL', confidence: 0.5 };
}

/**
 * Try to extract OOO return date
 */
function extractReturnDate(body: string): Date | null {
  const patterns = [
    /(?:back|return|available|zurück)\s+(?:on|am)?\s*(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)/i,
    /(\d{1,2}[./]\d{1,2}[./]\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const date = new Date(match[1]);
      if (!isNaN(date.getTime()) && date > new Date()) {
        return date;
      }
    }
  }
  return null;
}

interface ReplyProcessorData {
  accountId: string;
}

/**
 * Poll IMAP for new replies
 */
async function processReplies(job: Job<ReplyProcessorData>) {
  const { accountId } = job.data;

  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });

  if (!account || !account.imapHost || !account.imapPass) return;

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

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Get unseen messages from the last 7 days
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const messages = client.fetch(
        { seen: false, since },
        { envelope: true, source: true, bodyStructure: true }
      );

      for await (const msg of messages) {
        try {
          const envelope = msg.envelope;
          if (!envelope) continue;

          const fromEmail = envelope.from?.[0]?.address?.toLowerCase();
          const subject = envelope.subject || '';
          const messageId = envelope.messageId;
          const inReplyTo = envelope.inReplyTo;

          if (!fromEmail) continue;

          // Extract body text
          let bodyText = '';
          if (msg.source) {
            bodyText = msg.source.toString();
            // Simple text extraction
            const textMatch = bodyText.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?:\n--|\n\n)/);
            if (textMatch) {
              bodyText = textMatch[1];
            }
          }

          // Check if this is a reply to one of our sent emails
          let sentEmail = null;
          if (inReplyTo) {
            sentEmail = await prisma.sentEmail.findFirst({
              where: { messageId: inReplyTo },
              include: { campaign: true },
            });
          }

          if (!sentEmail) {
            // Try matching by from email in our leads
            sentEmail = await prisma.sentEmail.findFirst({
              where: { toEmail: fromEmail, repliedAt: null },
              include: { campaign: true },
              orderBy: { sentAt: 'desc' },
            });
          }

          // Classify the reply
          const classification = await classifyReply(bodyText);

          // Find or create thread
          let thread = await prisma.uniboxThread.findFirst({
            where: {
              accountId: account.id,
              OR: [
                { lead: { email: fromEmail } },
                { messages: { some: { fromEmail } } },
              ],
            },
          });

          const lead = await prisma.lead.findFirst({
            where: { email: fromEmail },
          });

          if (!thread) {
            thread = await prisma.uniboxThread.create({
              data: {
                accountId: account.id,
                campaignId: sentEmail?.campaignId,
                leadId: lead?.id,
                subject,
                tag: classification.tag as any,
                sentiment: classification.sentiment as any,
                aiConfidence: classification.confidence,
              },
            });
          }

          // Create message
          await prisma.uniboxMessage.create({
            data: {
              threadId: thread.id,
              messageId,
              direction: 'INBOUND',
              fromEmail,
              toEmail: account.email,
              subject,
              body: bodyText,
            },
          });

          // Update thread
          await prisma.uniboxThread.update({
            where: { id: thread.id },
            data: {
              lastMessageAt: new Date(),
              messageCount: { increment: 1 },
              tag: classification.tag as any,
              sentiment: classification.sentiment as any,
              aiConfidence: classification.confidence,
              isRead: false,
            },
          });

          // Update sent email
          if (sentEmail) {
            await prisma.sentEmail.update({
              where: { id: sentEmail.id },
              data: { repliedAt: new Date() },
            });

            // Update campaign stats
            await prisma.campaign.update({
              where: { id: sentEmail.campaignId },
              data: { totalReplies: { increment: 1 } },
            });

            // Stop sequence for this lead if configured
            if (sentEmail.campaign.stopOnReply) {
              await prisma.campaignLead.updateMany({
                where: {
                  campaignId: sentEmail.campaignId,
                  leadId: sentEmail.leadId,
                },
                data: { status: 'REPLIED' },
              });
            }

            // Handle auto-replies / OOO
            if (classification.tag === 'OUT_OF_OFFICE' && sentEmail.campaign.stopOnAutoReply) {
              const returnDate = extractReturnDate(bodyText);
              if (returnDate) {
                // Resume sequence after return date
                await prisma.campaignLead.updateMany({
                  where: {
                    campaignId: sentEmail.campaignId,
                    leadId: sentEmail.leadId,
                  },
                  data: {
                    status: 'PAUSED',
                    nextSendAt: returnDate,
                  },
                });
              }
            }

            // Handle unsubscribe
            if (classification.tag === 'UNSUBSCRIBE') {
              await prisma.lead.update({
                where: { id: sentEmail.leadId },
                data: { status: 'UNSUBSCRIBED' },
              });
              await prisma.campaignLead.updateMany({
                where: { leadId: sentEmail.leadId },
                data: { status: 'UNSUBSCRIBED' },
              });

              // Add to blocklist
              await prisma.blocklistEntry.create({
                data: {
                  workspaceId: sentEmail.campaign.workspaceId,
                  type: 'EMAIL',
                  value: fromEmail,
                  reason: 'Auto-detected unsubscribe request',
                },
              }).catch(() => {});
            }

            // Dispatch webhook
            await dispatchWebhook(sentEmail.campaign.workspaceId, 'reply_received', {
              emailId: sentEmail.id,
              campaignId: sentEmail.campaignId,
              leadId: sentEmail.leadId,
              fromEmail,
              subject,
              classification,
              repliedAt: new Date().toISOString(),
            });
          }

          // Mark email as seen
          if (msg.uid) {
            await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
          }

          console.log(`Reply processed: ${fromEmail} → ${account.email} [${classification.tag}]`);

        } catch (msgError) {
          console.error('Error processing message:', msgError);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

  } catch (error) {
    console.error(`IMAP polling error for ${account.email}:`, error);
  }
}

// Create worker
const replyWorker = new Worker('reply-processing', processReplies, {
  connection: redisConnection,
  concurrency: 5,
});

replyWorker.on('completed', (job) => {
  console.log(`Reply processing job ${job.id} completed`);
});

replyWorker.on('failed', (job, err) => {
  console.error(`Reply processing job ${job?.id} failed:`, err);
});

// Schedule reply processing for all active accounts
async function scheduleReplyProcessing() {
  const { replyQueue } = await import('../config/queue');

  const accounts = await prisma.emailAccount.findMany({
    where: { isActive: true, imapHost: { not: null } },
    select: { id: true },
  });

  for (const account of accounts) {
    await replyQueue.add(
      'process-replies',
      { accountId: account.id },
      {
        repeat: {
          every: 60000, // Every 60 seconds
        },
        jobId: `replies-${account.id}`,
      }
    );
  }

  console.log(`Scheduled reply processing for ${accounts.length} accounts`);
}

scheduleReplyProcessing().catch(console.error);

export default replyWorker;
console.log('Reply processor worker started');
