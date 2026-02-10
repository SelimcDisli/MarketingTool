// @ts-nocheck
import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { emailQueue } from '../config/queue';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireWorkspace);

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  timezone: z.string().default('UTC'),
  sendingDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  sendStartTime: z.string().default('09:00'),
  sendEndTime: z.string().default('17:00'),
  dailyLimit: z.number().min(1).optional(),
  slowRampEnabled: z.boolean().default(false),
  slowRampDays: z.number().default(14),
  slowRampStart: z.number().default(5),
  stopOnReply: z.boolean().default(true),
  stopOnAutoReply: z.boolean().default(false),
  trackOpens: z.boolean().default(true),
  trackClicks: z.boolean().default(true),
  accountIds: z.array(z.string()).optional(),
  leadListIds: z.array(z.string()).optional(),
});

const addStepSchema = z.object({
  order: z.number().min(0),
  type: z.enum(['EMAIL', 'WAIT', 'CONDITION']).default('EMAIL'),
  subject: z.string().optional(),
  body: z.string().optional(),
  delayDays: z.number().default(1),
  delayHours: z.number().default(0),
  variants: z.array(z.object({
    variantLabel: z.string().max(1).default('A'),
    subject: z.string(),
    body: z.string(),
    weight: z.number().default(1),
  })).optional(),
});

// List campaigns
router.get('/', async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string;
  const where: any = { workspaceId: req.workspaceId };
  if (status) where.status = status.toUpperCase();

  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      _count: {
        select: {
          steps: true,
          campaignLeads: true,
          accounts: true,
          sentEmails: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ campaigns, total: campaigns.length });
});

// Create campaign
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = createCampaignSchema.parse(req.body);

  const campaign = await prisma.$transaction(async (tx) => {
    const camp = await tx.campaign.create({
      data: {
        workspaceId: req.workspaceId!,
        name: data.name,
        timezone: data.timezone,
        sendingDays: data.sendingDays,
        sendStartTime: data.sendStartTime,
        sendEndTime: data.sendEndTime,
        dailyLimit: data.dailyLimit,
        slowRampEnabled: data.slowRampEnabled,
        slowRampDays: data.slowRampDays,
        slowRampStart: data.slowRampStart,
        stopOnReply: data.stopOnReply,
        stopOnAutoReply: data.stopOnAutoReply,
        trackOpens: data.trackOpens,
        trackClicks: data.trackClicks,
      },
    });

    // Assign accounts
    if (data.accountIds?.length) {
      await tx.campaignAccount.createMany({
        data: data.accountIds.map((accountId) => ({
          campaignId: camp.id,
          accountId,
        })),
      });
    }

    // Assign leads from lists
    if (data.leadListIds?.length) {
      const leads = await tx.lead.findMany({
        where: {
          workspaceId: req.workspaceId,
          listId: { in: data.leadListIds },
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      if (leads.length > 0) {
        await tx.campaignLead.createMany({
          data: leads.map((lead) => ({
            campaignId: camp.id,
            leadId: lead.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    return camp;
  });

  return res.status(201).json({ campaign });
});

// Get campaign detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
    include: {
      steps: {
        include: { variants: true },
        orderBy: { order: 'asc' },
      },
      accounts: {
        include: {
          account: {
            select: { id: true, email: true, displayName: true, healthScore: true },
          },
        },
      },
      _count: {
        select: {
          campaignLeads: true,
          sentEmails: true,
        },
      },
    },
  });

  if (!campaign) throw new AppError('Campaign not found', 404);
  return res.json({ campaign });
});

// Update campaign
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!campaign) throw new AppError('Campaign not found', 404);

  const allowed = [
    'name', 'timezone', 'sendingDays', 'sendStartTime', 'sendEndTime',
    'dailyLimit', 'slowRampEnabled', 'slowRampDays', 'slowRampStart',
    'stopOnReply', 'stopOnAutoReply', 'trackOpens', 'trackClicks', 'aiOptimize',
  ];

  const updates: any = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: updates,
  });

  return res.json({ campaign: updated });
});

// Delete campaign
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.campaign.deleteMany({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  return res.json({ message: 'Campaign deleted' });
});

// Start campaign
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
    include: {
      steps: { include: { variants: true } },
      accounts: true,
      _count: { select: { campaignLeads: true } },
    },
  });

  if (!campaign) throw new AppError('Campaign not found', 404);
  if (campaign.steps.length === 0) throw new AppError('Campaign needs at least one step', 400);
  if (campaign.accounts.length === 0) throw new AppError('Campaign needs at least one email account', 400);
  if (campaign._count.campaignLeads === 0) throw new AppError('Campaign needs at least one lead', 400);

  // Update status
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'ACTIVE', startedAt: new Date() },
  });

  // Schedule initial emails for all pending leads
  const pendingLeads = await prisma.campaignLead.findMany({
    where: { campaignId: campaign.id, status: 'PENDING' },
  });

  for (const cl of pendingLeads) {
    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: { status: 'IN_PROGRESS', nextSendAt: new Date() },
    });
  }

  // Add to email queue
  await emailQueue.add('process-campaign', {
    campaignId: campaign.id,
    workspaceId: req.workspaceId,
  }, {
    repeat: { every: 60000 }, // Check every minute
    jobId: `campaign-${campaign.id}`,
  });

  return res.json({ message: 'Campaign started', status: 'ACTIVE' });
});

// Pause campaign
router.post('/:id/pause', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!campaign) throw new AppError('Campaign not found', 404);

  const newStatus = campaign.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: newStatus },
  });

  if (newStatus === 'PAUSED') {
    // Remove from queue
    await emailQueue.removeRepeatableByKey(`campaign-${campaign.id}`).catch(() => {});
  } else {
    // Re-add to queue
    await emailQueue.add('process-campaign', {
      campaignId: campaign.id,
      workspaceId: req.workspaceId,
    }, {
      repeat: { every: 60000 },
      jobId: `campaign-${campaign.id}`,
    });
  }

  return res.json({ message: `Campaign ${newStatus.toLowerCase()}`, status: newStatus });
});

// Add step to campaign
router.post('/:id/steps', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!campaign) throw new AppError('Campaign not found', 404);

  const data = addStepSchema.parse(req.body);

  const step = await prisma.$transaction(async (tx) => {
    const newStep = await tx.campaignStep.create({
      data: {
        campaignId: campaign.id,
        order: data.order,
        type: data.type,
        subject: data.subject,
        body: data.body,
        delayDays: data.delayDays,
        delayHours: data.delayHours,
      },
    });

    // Create variants
    if (data.variants?.length) {
      await tx.stepVariant.createMany({
        data: data.variants.map((v) => ({
          stepId: newStep.id,
          variantLabel: v.variantLabel,
          subject: v.subject,
          body: v.body,
          weight: v.weight,
        })),
      });
    } else if (data.subject && data.body) {
      // Create default variant A
      await tx.stepVariant.create({
        data: {
          stepId: newStep.id,
          variantLabel: 'A',
          subject: data.subject,
          body: data.body,
        },
      });
    }

    return tx.campaignStep.findUnique({
      where: { id: newStep.id },
      include: { variants: true },
    });
  });

  return res.status(201).json({ step });
});

// Update step
router.patch('/:id/steps/:stepId', async (req: AuthRequest, res: Response) => {
  const step = await prisma.campaignStep.findFirst({
    where: { id: req.params.stepId, campaign: { id: req.params.id, workspaceId: req.workspaceId } },
  });
  if (!step) throw new AppError('Step not found', 404);

  const updated = await prisma.campaignStep.update({
    where: { id: req.params.stepId },
    data: {
      subject: req.body.subject,
      body: req.body.body,
      delayDays: req.body.delayDays,
      delayHours: req.body.delayHours,
      order: req.body.order,
    },
    include: { variants: true },
  });

  return res.json({ step: updated });
});

// Delete step
router.delete('/:id/steps/:stepId', async (req: AuthRequest, res: Response) => {
  await prisma.campaignStep.deleteMany({
    where: { id: req.params.stepId, campaign: { id: req.params.id, workspaceId: req.workspaceId } },
  });
  return res.json({ message: 'Step deleted' });
});

// Add A/Z variant to step
router.post('/:id/steps/:stepId/variants', async (req: AuthRequest, res: Response) => {
  const step = await prisma.campaignStep.findFirst({
    where: { id: req.params.stepId, campaign: { id: req.params.id, workspaceId: req.workspaceId } },
    include: { variants: true },
  });
  if (!step) throw new AppError('Step not found', 404);

  const nextLabel = String.fromCharCode(65 + step.variants.length); // A=65, B=66, etc.

  const variant = await prisma.stepVariant.create({
    data: {
      stepId: step.id,
      variantLabel: req.body.variantLabel || nextLabel,
      subject: req.body.subject,
      body: req.body.body,
      weight: req.body.weight || 1,
    },
  });

  return res.status(201).json({ variant });
});

// Get campaign analytics
router.get('/:id/analytics', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!campaign) throw new AppError('Campaign not found', 404);

  const [sentEmails, steps, dailyStats] = await Promise.all([
    prisma.sentEmail.aggregate({
      where: { campaignId: campaign.id },
      _count: true,
      _sum: { openCount: true, clickCount: true },
    }),
    prisma.campaignStep.findMany({
      where: { campaignId: campaign.id },
      include: {
        variants: {
          select: {
            id: true,
            variantLabel: true,
            totalSent: true,
            totalOpens: true,
            totalClicks: true,
            totalReplies: true,
          },
        },
        _count: {
          select: { sentEmails: true },
        },
      },
      orderBy: { order: 'asc' },
    }),
    prisma.sentEmail.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: true,
    }),
  ]);

  const replied = await prisma.sentEmail.count({
    where: { campaignId: campaign.id, repliedAt: { not: null } },
  });
  const bounced = await prisma.sentEmail.count({
    where: { campaignId: campaign.id, bouncedAt: { not: null } },
  });
  const opened = await prisma.sentEmail.count({
    where: { campaignId: campaign.id, openedAt: { not: null } },
  });
  const clicked = await prisma.sentEmail.count({
    where: { campaignId: campaign.id, clickedAt: { not: null } },
  });

  const total = sentEmails._count || 0;

  return res.json({
    overview: {
      totalSent: total,
      totalOpens: opened,
      totalClicks: clicked,
      totalReplies: replied,
      totalBounces: bounced,
      openRate: total > 0 ? (opened / total) * 100 : 0,
      clickRate: total > 0 ? (clicked / total) * 100 : 0,
      replyRate: total > 0 ? (replied / total) * 100 : 0,
      bounceRate: total > 0 ? (bounced / total) * 100 : 0,
    },
    steps,
    status: campaign.status,
  });
});

// Assign leads to campaign
router.post('/:id/leads', async (req: AuthRequest, res: Response) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!campaign) throw new AppError('Campaign not found', 404);

  const { leadIds, listIds } = req.body;
  let leadsToAdd: string[] = leadIds || [];

  if (listIds?.length) {
    const leads = await prisma.lead.findMany({
      where: {
        workspaceId: req.workspaceId,
        listId: { in: listIds },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    leadsToAdd = [...leadsToAdd, ...leads.map(l => l.id)];
  }

  // Deduplicate
  leadsToAdd = [...new Set(leadsToAdd)];

  // Check blocklist
  const blockedEmails = await prisma.blocklistEntry.findMany({
    where: { workspaceId: req.workspaceId },
    select: { value: true },
  });
  const blockedSet = new Set(blockedEmails.map(b => b.value.toLowerCase()));

  const validLeads = await prisma.lead.findMany({
    where: { id: { in: leadsToAdd } },
    select: { id: true, email: true },
  });

  const filteredLeads = validLeads.filter(l =>
    !blockedSet.has(l.email.toLowerCase()) &&
    !blockedSet.has(l.email.split('@')[1]?.toLowerCase())
  );

  const created = await prisma.campaignLead.createMany({
    data: filteredLeads.map(l => ({
      campaignId: campaign.id,
      leadId: l.id,
    })),
    skipDuplicates: true,
  });

  return res.json({
    added: created.count,
    blocked: validLeads.length - filteredLeads.length,
    total: leadsToAdd.length,
  });
});

export default router;
