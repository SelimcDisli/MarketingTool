// @ts-nocheck
import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma';
import { redisConnection } from '../config/queue';
import { decrypt } from '../utils/crypto';
import { processEmailContent } from '../utils/spintax';
import { config } from '../config';
import { dispatchWebhook } from '../routes/webhooks';

interface CampaignJobData {
  campaignId: string;
  workspaceId: string;
}

/**
 * Select a variant based on weight (A/Z testing)
 */
function selectVariant(variants: any[]): any {
  const activeVariants = variants.filter((v) => v.isActive);
  if (activeVariants.length === 0) return null;
  if (activeVariants.length === 1) return activeVariants[0];

  const totalWeight = activeVariants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;
  for (const variant of activeVariants) {
    random -= variant.weight;
    if (random <= 0) return variant;
  }
  return activeVariants[0];
}

/**
 * Select next account using round-robin (inbox rotation)
 */
async function selectAccount(campaignId: string): Promise<any> {
  const accounts = await prisma.campaignAccount.findMany({
    where: { campaignId },
    include: {
      account: true,
    },
  });

  const available = accounts
    .map((ca) => ca.account)
    .filter((a) => a.isActive && !a.isPaused && a.sentToday < a.dailySendLimit);

  if (available.length === 0) return null;

  // Find account with oldest lastSentAt (round-robin)
  available.sort((a, b) => {
    if (!a.lastSentAt) return -1;
    if (!b.lastSentAt) return 1;
    return a.lastSentAt.getTime() - b.lastSentAt.getTime();
  });

  // Ensure minimum 5-minute gap per account
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const readyAccount = available.find(
    (a) => !a.lastSentAt || a.lastSentAt < fiveMinAgo
  );

  return readyAccount || null;
}

/**
 * Calculate slow ramp daily limit
 */
function getSlowRampLimit(campaign: any): number {
  if (!campaign.slowRampEnabled || !campaign.startedAt) return campaign.dailyLimit || 1000;

  const daysSinceStart = Math.floor(
    (Date.now() - campaign.startedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const rampRate = (campaign.dailyLimit || 30) / campaign.slowRampDays;
  const currentLimit = Math.floor(campaign.slowRampStart + rampRate * daysSinceStart);

  return Math.min(currentLimit, campaign.dailyLimit || 1000);
}

/**
 * Check if current time is within sending window
 */
function isWithinSendingWindow(campaign: any): boolean {
  const now = new Date();
  // Simple check - expand with timezone support
  const currentDay = now.getDay();
  if (!campaign.sendingDays.includes(currentDay)) return false;

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return currentTime >= campaign.sendStartTime && currentTime <= campaign.sendEndTime;
}

/**
 * Inject tracking into email HTML
 */
function injectTracking(html: string, trackingId: string, trackOpens: boolean, trackClicks: boolean): string {
  let result = html;
  const trackingDomain = config.tracking.domain;

  // Open tracking pixel
  if (trackOpens) {
    result += `<img src="${trackingDomain}/t/open/${trackingId}" width="1" height="1" style="display:none" />`;
  }

  // Click tracking - wrap all links
  if (trackClicks) {
    result = result.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match, url) => {
        const encodedUrl = encodeURIComponent(url);
        return `href="${trackingDomain}/t/click/${trackingId}?url=${encodedUrl}"`;
      }
    );
  }

  // Add unsubscribe link
  result += `<br><p style="font-size: 11px; color: #999; margin-top: 20px;">
    <a href="${trackingDomain}/t/unsubscribe/${trackingId}" style="color: #999;">Unsubscribe</a>
  </p>`;

  return result;
}

/**
 * Process a campaign — find leads that need emails and send them
 */
async function processCampaign(job: Job<CampaignJobData>) {
  const { campaignId } = job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      steps: {
        include: { variants: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!campaign || campaign.status !== 'ACTIVE') {
    console.log(`Campaign ${campaignId} not active, skipping`);
    return;
  }

  // Check sending window
  if (!isWithinSendingWindow(campaign)) {
    return;
  }

  // Get slow ramp limit
  const dailyLimit = getSlowRampLimit(campaign);

  // Get today's sent count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sentToday = await prisma.sentEmail.count({
    where: { campaignId, sentAt: { gte: today } },
  });

  if (sentToday >= dailyLimit) {
    return;
  }

  const remaining = dailyLimit - sentToday;

  // Get leads ready to send
  const campaignLeads = await prisma.campaignLead.findMany({
    where: {
      campaignId,
      status: 'IN_PROGRESS',
      nextSendAt: { lte: new Date() },
    },
    include: {
      lead: true,
    },
    take: Math.min(remaining, 10), // Process max 10 per cycle
  });

  for (const cl of campaignLeads) {
    const lead = cl.lead;
    const currentStepIndex = cl.currentStep;
    const step = campaign.steps[currentStepIndex];

    if (!step) {
      // Completed all steps
      await prisma.campaignLead.update({
        where: { id: cl.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      continue;
    }

    // Select account (inbox rotation)
    const account = await selectAccount(campaignId);
    if (!account) {
      console.log('No available accounts for sending');
      break;
    }

    // Select variant (A/Z testing)
    const variant = selectVariant(step.variants);
    if (!variant) {
      console.log(`No active variants for step ${step.id}`);
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
        campaignId,
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
        host: account.smtpHost!,
        port: account.smtpPort || 587,
        secure: account.smtpSecure,
        auth: {
          user: account.smtpUser || account.email,
          pass: decrypt(account.smtpPass!),
        },
      });

      // Inject tracking
      const trackedHtml = injectTracking(
        bodyHtml,
        sentEmail.trackingId,
        campaign.trackOpens,
        campaign.trackClicks
      );

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
        data: {
          status: 'SENT',
          messageId: info.messageId,
          sentAt: new Date(),
        },
      });

      // Update account stats
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          sentToday: { increment: 1 },
          lastSentAt: new Date(),
        },
      });

      // Update variant stats
      await prisma.stepVariant.update({
        where: { id: variant.id },
        data: { totalSent: { increment: 1 } },
      });

      // Update campaign stats
      await prisma.campaign.update({
        where: { id: campaignId },
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
          data: {
            currentStep: currentStepIndex + 1,
            nextSendAt,
          },
        });
      } else {
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      // Dispatch webhook
      if (campaign.workspaceId) {
        await dispatchWebhook(campaign.workspaceId, 'email_sent', {
          emailId: sentEmail.id,
          campaignId,
          leadId: lead.id,
          toEmail: lead.email,
          subject,
          sentAt: new Date().toISOString(),
        });
      }

      console.log(`Email sent: ${lead.email} (Campaign: ${campaign.name}, Step: ${step.order})`);

    } catch (error: any) {
      console.error(`Failed to send to ${lead.email}:`, error.message);

      // Handle bounce
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
        // Mark lead as bounced
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'BOUNCED' },
        });
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { status: 'BOUNCED' },
        });
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { totalBounces: { increment: 1 } },
        });

        // Check bounce rate — auto-pause if >5%
        const totalSent = campaign.totalSent + 1;
        const totalBounces = campaign.totalBounces + 1;
        if (totalSent >= 100 && (totalBounces / totalSent) > 0.05) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'PAUSED' },
          });
          console.log(`Campaign ${campaignId} auto-paused due to high bounce rate`);
        }
      }
    }
  }

  // Check if campaign is complete
  const remainingLeads = await prisma.campaignLead.count({
    where: {
      campaignId,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
    },
  });

  if (remainingLeads === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    if (campaign.workspaceId) {
      await dispatchWebhook(campaign.workspaceId, 'campaign_completed', {
        campaignId,
        name: campaign.name,
        completedAt: new Date().toISOString(),
      });
    }
  }
}

// Create worker
const emailWorker = new Worker('email-sending', processCampaign, {
  connection: redisConnection,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 60000, // 10 jobs per minute
  },
});

emailWorker.on('completed', (job) => {
  console.log(`Email job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed:`, err);
});

// Reset daily send counts at midnight
async function resetDailyCounts() {
  await prisma.emailAccount.updateMany({
    data: { sentToday: 0 },
  });
  console.log('Daily send counts reset');
}

// Schedule reset at midnight
const now = new Date();
const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
setTimeout(() => {
  resetDailyCounts();
  setInterval(resetDailyCounts, 24 * 60 * 60 * 1000);
}, msUntilMidnight);

export default emailWorker;
console.log('Email sender worker started');
