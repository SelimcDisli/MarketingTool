// @ts-nocheck
import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticate, requireWorkspace, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { generateToken, generateHmac } from '../utils/crypto';
import { webhookQueue } from '../config/queue';

const router = Router();
router.use(authenticate, requireWorkspace);

const VALID_EVENTS = [
  'all_events',
  'email_sent',
  'email_opened',
  'email_link_clicked',
  'reply_received',
  'email_bounced',
  'lead_unsubscribed',
  'campaign_completed',
  'lead_status_changed',
];

// List webhooks
router.get('/', async (req: AuthRequest, res: Response) => {
  const webhooks = await prisma.webhook.findMany({
    where: { workspaceId: req.workspaceId },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      lastTriggeredAt: true,
      failCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ webhooks });
});

// Create webhook
router.post('/', async (req: AuthRequest, res: Response) => {
  const { url, events } = req.body;

  if (!url) throw new AppError('URL is required', 400);
  if (!events || !Array.isArray(events)) throw new AppError('Events array is required', 400);

  const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    throw new AppError(`Invalid events: ${invalidEvents.join(', ')}`, 400);
  }

  const secret = generateToken(32);

  const webhook = await prisma.webhook.create({
    data: {
      workspaceId: req.workspaceId!,
      url,
      events,
      secret,
    },
  });

  return res.status(201).json({
    webhook: {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // Only shown once!
    },
  });
});

// Update webhook
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const webhook = await prisma.webhook.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!webhook) throw new AppError('Webhook not found', 404);

  const updates: any = {};
  if (req.body.url) updates.url = req.body.url;
  if (req.body.events) updates.events = req.body.events;
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;

  const updated = await prisma.webhook.update({
    where: { id: req.params.id },
    data: updates,
  });

  return res.json({ webhook: updated });
});

// Delete webhook
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.webhook.deleteMany({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  return res.json({ message: 'Webhook deleted' });
});

// Test webhook
router.post('/:id/test', async (req: AuthRequest, res: Response) => {
  const webhook = await prisma.webhook.findFirst({
    where: { id: req.params.id, workspaceId: req.workspaceId },
  });
  if (!webhook) throw new AppError('Webhook not found', 404);

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook delivery',
      workspaceId: req.workspaceId,
    },
  };

  await webhookQueue.add('deliver', {
    webhookId: webhook.id,
    payload: testPayload,
  });

  return res.json({ message: 'Test webhook queued for delivery' });
});

// ==================== WEBHOOK DISPATCHER (used by workers) ====================

export async function dispatchWebhook(
  workspaceId: string,
  event: string,
  data: any
) {
  const webhooks = await prisma.webhook.findMany({
    where: {
      workspaceId,
      isActive: true,
      OR: [
        { events: { has: event } },
        { events: { has: 'all_events' } },
      ],
    },
  });

  for (const webhook of webhooks) {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    await webhookQueue.add('deliver', {
      webhookId: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      payload,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

export default router;
