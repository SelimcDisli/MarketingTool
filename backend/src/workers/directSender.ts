// @ts-nocheck
/**
 * Direct Email Sender — works WITHOUT Redis/BullMQ
 * Runs as a simple setInterval() inside the main process.
 * Processes all ACTIVE campaigns every 60 seconds.
 */
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import prisma from '../config/prisma';
import { decrypt } from '../utils/crypto';
import { processEmailContent } from '../utils/spintax';
import { config } from '../config';

let isProcessing = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Select a variant based on weight (A/Z testing)
 */
function selectVariant(variants: any[]): any {
  const active = variants.filter((v) => v.isActive);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0];
  const totalWeight = active.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  for (const variant of active) {
    random -= variant.weight;
    if (random <= 0) return variant;
  }
  return active[0];
}

/**
 * Check if current time is within sending window
 */
function isWithinSendingWindow(campaign: any): boolean {
  const now = new Date();
  const currentDay = now.getDay();
  if (campaign.sendingDays && !campaign.sendingDays.includes(currentDay)) return false;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const start = campaign.sendStartTime || '00:00';
  const end = campaign.sendEndTime || '23:59';
  return currentTime >= start && currentTime <= end;
}

/**
 * Inject tracking into email HTML
 */
function injectTracking(html: string, trackingId: string, trackOpens: boolean, trackClicks: boolean): string {
  let result = html;
  const trackingDomain = config.tracking.domain;

  if (trackOpens) {
    result += `<img src="${trackingDomain}/t/open/${trackingId}" width="1" height="1" style="display:none" />`;
  }

  if (trackClicks) {
    result = result.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match, url) => {
        const encodedUrl = encodeURIComponent(url);
        return `href="${trackingDomain}/t/click/${trackingId}?url=${encodedUrl}"`;
      }
    );
  }

  result += `<br><p style="font-size: 11px; color: #999; margin-top: 20px;">
    <a href="${trackingDomain}/t/unsubscribe/${trackingId}" style="color: #999;">Unsubscribe</a>
  </p>`;

  return result;
}

/**
 * Process all active campaigns
 */
async function processAllCampaigns() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Find all active campaigns
    const campaigns = await prisma.campaign.findMany({
      where: { status: 'ACTIVE' },
      include: {
        steps: {
          include: { variants: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (campaigns.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`[DirectSender] Processing ${campaigns.length} active campaigns...`);

    for (const campaign of campaigns) {
      try {
        await processSingleCampaign(campaign);
      } catch (err: any) {
        console.error(`[DirectSender] Error processing campaign ${campaign.name}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[DirectSender] Fatal error:', err.message);
  } finally {
    isProcessing = false;
  }
}

async function processSingleCampaign(campaign: any) {
  // Check sending window
  if (!isWithinSendingWindow(campaign)) return;

  // Get today's sent count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sentToday = await prisma.sentEmail.count({
    where: { campaignId: campaign.id, sentAt: { gte: today } },
  });

  const dailyLimit = campaign.dailyLimit || 50;
  if (sentToday >= dailyLimit) return;

  const remaining = dailyLimit - sentToday;

  // Get campaign accounts
  const campaignAccounts = await prisma.campaignAccount.findMany({
    where: { campaignId: campaign.id },
    include: { account: true },
  });

  const availableAccounts = campaignAccounts
    .map((ca) => ca.account)
    .filter((a) => a.isActive && !a.isPaused && a.sentToday < a.dailySendLimit && a.smtpHost && a.smtpPass);

  if (availableAccounts.length === 0) {
    console.log(`[DirectSender] No available accounts for campaign "${campaign.name}"`);
    return;
  }

  // Get leads ready to send
  const campaignLeads = await prisma.campaignLead.findMany({
    where: {
      campaignId: campaign.id,
      status: 'IN_PROGRESS',
      nextSendAt: { lte: new Date() },
    },
    include: { lead: true },
    take: Math.min(remaining, 10),
  });

  if (campaignLeads.length === 0) {
    // Check if campaign is complete
    const pendingCount = await prisma.campaignLead.count({
      where: { campaignId: campaign.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });
    if (pendingCount === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      console.log(`[DirectSender] Campaign "${campaign.name}" completed!`);
    }
    return;
  }

  let accountIndex = 0;
  console.log(`[DirectSender] Sending ${campaignLeads.length} emails for "${campaign.name}"...`);

  for (const cl of campaignLeads) {
    const lead = cl.lead;
    const currentStepIndex = cl.currentStep;
    const step = campaign.steps[currentStepIndex];

    if (!step) {
      await prisma.campaignLead.update({
        where: { id: cl.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      continue;
    }

    // Round-robin account selection
    const account = availableAccounts[accountIndex % availableAccounts.length];
    accountIndex++;

    // Select variant
    const variant = selectVariant(step.variants);
    if (!variant) {
      console.log(`[DirectSender] No active variants for step ${step.order}`);
      continue;
    }

    // Build lead data for merge tags
    const leadData: Record<string, string | null | undefined> = {
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      jobTitle: lead.jobTitle,
      phone: lead.phone,
      website: lead.website,
      location: lead.location,
      linkedinUrl: lead.linkedinUrl,
      ...(lead.customVars as Record<string, string> || {}),
    };

    // Process content
    const subject = processEmailContent(variant.subject, leadData);
    const bodyText = processEmailContent(variant.body, leadData);
    const bodyHtml = bodyText.replace(/\n/g, '<br>');

    // Create sent email record
    const sentEmail = await prisma.sentEmail.create({
      data: {
        campaignId: campaign.id,
        stepId: step.id,
        variantId: variant.id,
        leadId: lead.id,
        accountId: account.id,
        subject,
        body: bodyText,
        fromEmail: account.email,
        toEmail: lead.email,
        status: 'SENDING',
      },
    });

    try {
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort || 587,
        secure: account.smtpSecure,
        auth: {
          user: account.smtpUser || account.email,
          pass: decrypt(account.smtpPass),
        },
        tls: { rejectUnauthorized: false },
      });

      // Inject tracking
      const trackedHtml = injectTracking(bodyHtml, sentEmail.trackingId, campaign.trackOpens, campaign.trackClicks);

      // Send email
      const info = await transporter.sendMail({
        from: `${account.displayName || account.email} <${account.email}>`,
        to: lead.email,
        subject,
        text: bodyText,
        html: trackedHtml,
        headers: {
          'List-Unsubscribe': `<${config.tracking.domain}/t/unsubscribe/${sentEmail.trackingId}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      // Update sent email
      await prisma.sentEmail.update({
        where: { id: sentEmail.id },
        data: { status: 'SENT', messageId: info.messageId, sentAt: new Date() },
      });

      // Update account stats
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { sentToday: { increment: 1 }, lastSentAt: new Date() },
      });

      // Update variant stats
      await prisma.stepVariant.update({
        where: { id: variant.id },
        data: { totalSent: { increment: 1 } },
      });

      // Update campaign stats
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalSent: { increment: 1 } },
      });

      // Schedule next step
      const nextStep = campaign.steps[currentStepIndex + 1];
      if (nextStep) {
        const nextSendAt = new Date();
        nextSendAt.setDate(nextSendAt.getDate() + nextStep.delayDays);
        nextSendAt.setHours(nextSendAt.getHours() + nextStep.delayHours);
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { currentStep: currentStepIndex + 1, nextSendAt },
        });
      } else {
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      console.log(`  ✉️  ${lead.email} ← sent (${account.email}, step ${step.order + 1})`);

    } catch (error: any) {
      console.error(`  ❌ ${lead.email}: ${error.message}`);

      const isBounce = error.responseCode >= 500 || error.code === 'EENVELOPE';
      await prisma.sentEmail.update({
        where: { id: sentEmail.id },
        data: {
          status: isBounce ? 'BOUNCED' : 'FAILED',
          error: error.message,
          bouncedAt: isBounce ? new Date() : null,
          bounceType: isBounce ? 'hard' : null,
        },
      });

      if (isBounce) {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: 'BOUNCED' } });
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: 'BOUNCED' } });
        await prisma.campaign.update({ where: { id: campaign.id }, data: { totalBounces: { increment: 1 } } });
      }
    }

    // Small delay between sends (2-5 seconds randomized)
    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));
  }
}

/**
 * Process replies for all accounts with IMAP configured
 */
async function processAllReplies() {
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true, imapHost: { not: null }, imapPass: { not: null } },
    });

    for (const account of accounts) {
      try {
        await processAccountReplies(account);
      } catch (err: any) {
        console.error(`[DirectSender] IMAP error for ${account.email}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[DirectSender] Reply processing error:', err.message);
  }
}

async function processAccountReplies(account: any) {
  if (!account.imapHost || !account.imapPass) return;

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    auth: {
      user: account.imapUser || account.email,
      pass: decrypt(account.imapPass),
    },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const messages = client.fetch(
        { seen: false, since },
        { envelope: true, source: true }
      );

      let processedCount = 0;
      for await (const msg of messages) {
        try {
          const envelope = msg.envelope;
          if (!envelope) continue;

          const fromEmail = envelope.from?.[0]?.address?.toLowerCase();
          const subject = envelope.subject || '';
          const messageId = envelope.messageId;
          const inReplyTo = envelope.inReplyTo;
          if (!fromEmail) continue;

          // Extract body
          let bodyText = '';
          if (msg.source) {
            const raw = msg.source.toString();
            const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?:\n--|\n\n)/);
            bodyText = textMatch ? textMatch[1] : raw.substring(0, 2000);
          }

          // Match to our sent email
          let sentEmail = null;
          if (inReplyTo) {
            sentEmail = await prisma.sentEmail.findFirst({
              where: { messageId: inReplyTo },
              include: { campaign: true },
            });
          }
          if (!sentEmail) {
            sentEmail = await prisma.sentEmail.findFirst({
              where: { toEmail: fromEmail, repliedAt: null },
              include: { campaign: true },
              orderBy: { sentAt: 'desc' },
            });
          }

          // Simple classification
          const lowerBody = bodyText.toLowerCase();
          let tag = 'NEW';
          if (['out of office', 'away from', 'on vacation', 'auto-reply', 'abwesend'].some(k => lowerBody.includes(k))) tag = 'OUT_OF_OFFICE';
          else if (['unsubscribe', 'remove me', 'stop emailing', 'abmelden'].some(k => lowerBody.includes(k))) tag = 'UNSUBSCRIBE';
          else if (['interested', 'tell me more', 'let\'s talk', 'set up a call', 'sounds good', 'interessiert'].some(k => lowerBody.includes(k))) tag = 'INTERESTED';
          else if (['not interested', 'no thanks', 'not a good fit', 'kein interesse'].some(k => lowerBody.includes(k))) tag = 'NOT_INTERESTED';

          // Find or create thread
          const lead = await prisma.lead.findFirst({ where: { email: fromEmail } });

          let thread = await prisma.uniboxThread.findFirst({
            where: {
              accountId: account.id,
              OR: [
                { leadId: lead?.id },
                { messages: { some: { fromEmail } } },
              ],
            },
          });

          if (!thread) {
            thread = await prisma.uniboxThread.create({
              data: {
                accountId: account.id,
                campaignId: sentEmail?.campaignId,
                leadId: lead?.id,
                subject,
                tag: tag as any,
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
              tag: tag as any,
              isRead: false,
            },
          });

          // Update sent email & campaign
          if (sentEmail) {
            await prisma.sentEmail.update({
              where: { id: sentEmail.id },
              data: { repliedAt: new Date() },
            });
            await prisma.campaign.update({
              where: { id: sentEmail.campaignId },
              data: { totalReplies: { increment: 1 } },
            });

            // Stop sequence if configured
            if (sentEmail.campaign?.stopOnReply) {
              await prisma.campaignLead.updateMany({
                where: { campaignId: sentEmail.campaignId, leadId: sentEmail.leadId },
                data: { status: 'REPLIED' },
              });
            }

            // Handle unsubscribe
            if (tag === 'UNSUBSCRIBE') {
              await prisma.lead.update({ where: { id: sentEmail.leadId }, data: { status: 'UNSUBSCRIBED' } });
              await prisma.campaignLead.updateMany({ where: { leadId: sentEmail.leadId }, data: { status: 'UNSUBSCRIBED' } });
            }
          }

          // Mark as seen
          if (msg.uid) {
            await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
          }

          processedCount++;
        } catch (msgErr: any) {
          // Skip individual message errors
        }
      }

      if (processedCount > 0) {
        console.log(`[DirectSender] Processed ${processedCount} replies for ${account.email}`);
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    // Connection error — not fatal
    if (err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND')) {
      console.warn(`[DirectSender] IMAP unreachable for ${account.email}: ${err.message}`);
    }
  }
}

/**
 * Reset daily send counts at midnight
 */
async function resetDailyCounts() {
  try {
    await prisma.emailAccount.updateMany({ data: { sentToday: 0 } });
    console.log('[DirectSender] Daily send counts reset');
  } catch (e) { }
}

/**
 * Start the direct sender (called from index.ts)
 */
export function startDirectSender() {
  console.log('  📨 Direct email sender started (no Redis needed)');

  // Process campaigns every 60 seconds
  intervalId = setInterval(processAllCampaigns, 60 * 1000);

  // Process replies every 2 minutes
  setInterval(processAllReplies, 2 * 60 * 1000);

  // Reset daily counts at midnight
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  setTimeout(() => {
    resetDailyCounts();
    setInterval(resetDailyCounts, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  // Run once immediately after 5 seconds (let server boot)
  setTimeout(() => {
    processAllCampaigns();
    processAllReplies();
  }, 5000);
}

export function stopDirectSender() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
