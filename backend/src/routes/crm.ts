// @ts-nocheck
import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate, requireWorkspace);

// ==================== PIPELINES ====================

// List pipelines
router.get('/pipelines', async (req: AuthRequest, res: Response) => {
  const pipelines = await prisma.crmPipeline.findMany({
    where: { workspaceId: req.workspaceId },
    include: {
      stages: { orderBy: { order: 'asc' } },
      _count: { select: { deals: true } },
    },
  });
  return res.json({ pipelines });
});

// Create pipeline
router.post('/pipelines', async (req: AuthRequest, res: Response) => {
  const { name, stages } = req.body;

  const pipeline = await prisma.crmPipeline.create({
    data: {
      workspaceId: req.workspaceId!,
      name,
      stages: {
        createMany: {
          data: (stages || [
            { name: 'Lead', order: 0, color: '#94a3b8' },
            { name: 'Contacted', order: 1, color: '#60a5fa' },
            { name: 'Qualified', order: 2, color: '#34d399' },
            { name: 'Proposal', order: 3, color: '#fbbf24' },
            { name: 'Closed Won', order: 4, color: '#22c55e' },
            { name: 'Closed Lost', order: 5, color: '#ef4444' },
          ]).map((s: any, i: number) => ({
            name: s.name,
            order: s.order ?? i,
            color: s.color || '#6366f1',
          })),
        },
      },
    },
    include: { stages: { orderBy: { order: 'asc' } } },
  });

  return res.status(201).json({ pipeline });
});

// Update pipeline
router.patch('/pipelines/:id', async (req: AuthRequest, res: Response) => {
  const pipeline = await prisma.crmPipeline.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!pipeline) throw new AppError('Pipeline not found', 404);

  const updated = await prisma.crmPipeline.update({
    where: { id: req.params.id },
    data: { name: req.body.name },
    include: { stages: { orderBy: { order: 'asc' } } },
  });

  return res.json({ pipeline: updated });
});

// ==================== DEALS ====================

// List deals
router.get('/deals', async (req: AuthRequest, res: Response) => {
  const pipelineId = req.query.pipelineId as string;
  const stageId = req.query.stageId as string;

  const where: any = { pipeline: { workspaceId: req.workspaceId } };
  if (pipelineId) where.pipelineId = pipelineId;
  if (stageId) where.stageId = stageId;

  const deals = await prisma.crmDeal.findMany({
    where,
    include: {
      stage: true,
      lead: {
        select: { id: true, email: true, firstName: true, lastName: true, company: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calculate pipeline metrics
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  const closedWon = deals.filter((d) => d.closedAt && !d.lostReason);
  const closedLost = deals.filter((d) => d.lostReason);
  const wonValue = closedWon.reduce((sum, d) => sum + (d.value || 0), 0);

  return res.json({
    deals,
    metrics: {
      totalDeals: deals.length,
      totalValue,
      wonValue,
      avgDealSize: deals.length > 0 ? totalValue / deals.length : 0,
      winRate: (closedWon.length + closedLost.length) > 0
        ? ((closedWon.length / (closedWon.length + closedLost.length)) * 100).toFixed(1)
        : 0,
    },
  });
});

// Create deal
router.post('/deals', async (req: AuthRequest, res: Response) => {
  const { pipelineId, stageId, leadId, title, value, currency, expectedCloseDate } = req.body;

  // Verify pipeline belongs to workspace
  const pipeline = await prisma.crmPipeline.findFirst({
    where: { id: pipelineId, workspaceId: req.workspaceId },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) throw new AppError('Pipeline not found', 404);

  // Use first stage if none specified
  const targetStageId = stageId || pipeline.stages[0]?.id;
  if (!targetStageId) throw new AppError('No stages in pipeline', 400);

  const deal = await prisma.crmDeal.create({
    data: {
      pipelineId,
      stageId: targetStageId,
      leadId,
      title,
      value: value || 0,
      currency: currency || 'USD',
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
    },
    include: { stage: true, lead: true },
  });

  return res.status(201).json({ deal });
});

// Update deal (move stage, update value)
router.patch('/deals/:id', async (req: AuthRequest, res: Response) => {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: req.params.id, pipeline: { workspaceId: req.workspaceId } },
  });
  if (!deal) throw new AppError('Deal not found', 404);

  const updates: any = {};
  if (req.body.stageId) updates.stageId = req.body.stageId;
  if (req.body.title) updates.title = req.body.title;
  if (req.body.value !== undefined) updates.value = req.body.value;
  if (req.body.currency) updates.currency = req.body.currency;
  if (req.body.expectedCloseDate) updates.expectedCloseDate = new Date(req.body.expectedCloseDate);
  if (req.body.closedAt) updates.closedAt = new Date(req.body.closedAt);
  if (req.body.lostReason) updates.lostReason = req.body.lostReason;

  const updated = await prisma.crmDeal.update({
    where: { id: req.params.id },
    data: updates,
    include: { stage: true, lead: true },
  });

  return res.json({ deal: updated });
});

// Delete deal
router.delete('/deals/:id', async (req: AuthRequest, res: Response) => {
  await prisma.crmDeal.deleteMany({
    where: { id: req.params.id, pipeline: { workspaceId: req.workspaceId } },
  });
  return res.json({ message: 'Deal deleted' });
});

// Get deal detail
router.get('/deals/:id', async (req: AuthRequest, res: Response) => {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: req.params.id, pipeline: { workspaceId: req.workspaceId } },
    include: {
      stage: true,
      pipeline: { include: { stages: { orderBy: { order: 'asc' } } } },
      lead: {
        include: {
          sentEmails: { orderBy: { sentAt: 'desc' }, take: 10 },
          uniboxThreads: { orderBy: { lastMessageAt: 'desc' }, take: 5 },
        },
      },
    },
  });
  if (!deal) throw new AppError('Deal not found', 404);
  return res.json({ deal });
});

export default router;
