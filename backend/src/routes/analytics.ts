// @ts-nocheck
import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireWorkspace);

// Dashboard overview
router.get('/overview', async (req: AuthRequest, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalSent,
    totalOpened,
    totalClicked,
    totalReplied,
    totalBounced,
    activeCampaigns,
    totalLeads,
    totalAccounts,
  ] = await Promise.all([
    prisma.sentEmail.count({
      where: {
        campaign: { workspaceId: req.workspaceId },
        sentAt: { gte: startDate },
        status: { in: ['SENT', 'DELIVERED'] },
      },
    }),
    prisma.sentEmail.count({
      where: {
        campaign: { workspaceId: req.workspaceId },
        sentAt: { gte: startDate },
        openedAt: { not: null },
      },
    }),
    prisma.sentEmail.count({
      where: {
        campaign: { workspaceId: req.workspaceId },
        sentAt: { gte: startDate },
        clickedAt: { not: null },
      },
    }),
    prisma.sentEmail.count({
      where: {
        campaign: { workspaceId: req.workspaceId },
        sentAt: { gte: startDate },
        repliedAt: { not: null },
      },
    }),
    prisma.sentEmail.count({
      where: {
        campaign: { workspaceId: req.workspaceId },
        sentAt: { gte: startDate },
        bouncedAt: { not: null },
      },
    }),
    prisma.campaign.count({
      where: { workspaceId: req.workspaceId, status: 'ACTIVE' },
    }),
    prisma.lead.count({
      where: { workspaceId: req.workspaceId, status: 'ACTIVE' },
    }),
    prisma.emailAccount.count({
      where: { workspaceId: req.workspaceId, isActive: true },
    }),
  ]);

  return res.json({
    period: { days, startDate },
    emails: {
      sent: totalSent,
      opened: totalOpened,
      clicked: totalClicked,
      replied: totalReplied,
      bounced: totalBounced,
      openRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : 0,
      clickRate: totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : 0,
      replyRate: totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : 0,
      bounceRate: totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : 0,
    },
    activeCampaigns,
    totalLeads,
    totalAccounts,
  });
});

// Daily stats for charts
router.get('/daily', async (req: AuthRequest, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const campaignId = req.query.campaignId as string;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: {
      workspaceId: req.workspaceId,
      campaignId: campaignId || undefined,
      date: { gte: startDate },
    },
    orderBy: { date: 'asc' },
  });

  // If no snapshots, calculate from sent emails
  if (snapshots.length === 0) {
    const where: any = {
      campaign: { workspaceId: req.workspaceId },
      sentAt: { gte: startDate },
    };
    if (campaignId) where.campaignId = campaignId;

    const emails = await prisma.sentEmail.findMany({
      where,
      select: {
        sentAt: true,
        openedAt: true,
        clickedAt: true,
        repliedAt: true,
        bouncedAt: true,
      },
    });

    // Group by date
    const dailyMap: Record<string, any> = {};
    for (const email of emails) {
      if (!email.sentAt) continue;
      const dateKey = email.sentAt.toISOString().split('T')[0];
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
      }
      dailyMap[dateKey].sent++;
      if (email.openedAt) dailyMap[dateKey].opened++;
      if (email.clickedAt) dailyMap[dateKey].clicked++;
      if (email.repliedAt) dailyMap[dateKey].replied++;
      if (email.bouncedAt) dailyMap[dateKey].bounced++;
    }

    return res.json({
      daily: Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date)),
    });
  }

  return res.json({
    daily: snapshots.map((s) => ({
      date: s.date,
      sent: s.emailsSent,
      opened: s.emailsOpened,
      clicked: s.emailsClicked,
      replied: s.emailsReplied,
      bounced: s.emailsBounced,
      openRate: s.openRate,
      clickRate: s.clickRate,
      replyRate: s.replyRate,
    })),
  });
});

// Account performance
router.get('/accounts', async (req: AuthRequest, res: Response) => {
  const accounts = await prisma.emailAccount.findMany({
    where: { workspaceId: req.workspaceId, isActive: true },
    select: {
      id: true,
      email: true,
      displayName: true,
      healthScore: true,
      deliverabilityScore: true,
      sentToday: true,
      dailySendLimit: true,
      warmupEnabled: true,
      _count: {
        select: {
          sentEmails: true,
          campaignAccounts: true,
        },
      },
    },
    orderBy: { healthScore: 'desc' },
  });

  // Calculate per-account stats
  const accountStats = await Promise.all(
    accounts.map(async (acc) => {
      const [sent, opened, replied] = await Promise.all([
        prisma.sentEmail.count({ where: { accountId: acc.id } }),
        prisma.sentEmail.count({ where: { accountId: acc.id, openedAt: { not: null } } }),
        prisma.sentEmail.count({ where: { accountId: acc.id, repliedAt: { not: null } } }),
      ]);

      return {
        ...acc,
        stats: {
          totalSent: sent,
          totalOpened: opened,
          totalReplied: replied,
          openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : 0,
          replyRate: sent > 0 ? ((replied / sent) * 100).toFixed(1) : 0,
        },
      };
    })
  );

  return res.json({ accounts: accountStats });
});

export default router;
