// @ts-nocheck
import { Worker, Job } from 'bullmq';
import prisma from '../config/prisma';
import { redisConnection } from '../config/queue';
import { generateHmac } from '../utils/crypto';

interface WebhookDeliveryData {
  webhookId: string;
  url?: string;
  secret?: string;
  payload: any;
}

async function deliverWebhook(job: Job<WebhookDeliveryData>) {
  const { webhookId, payload } = job.data;

  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || !webhook.isActive) return;

  const payloadStr = JSON.stringify(payload);
  const signature = generateHmac(payloadStr, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Success — reset fail count
    await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        lastTriggeredAt: new Date(),
        failCount: 0,
      },
    });

    console.log(`Webhook delivered: ${webhook.url} [${payload.event}]`);

  } catch (error: any) {
    console.error(`Webhook delivery failed: ${webhook.url}`, error.message);

    // Increment fail count
    const updated = await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        failCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    });

    // Disable after 10 consecutive failures
    if (updated.failCount >= 10) {
      await prisma.webhook.update({
        where: { id: webhookId },
        data: { isActive: false },
      });
      console.log(`Webhook disabled after 10 failures: ${webhook.url}`);
    }

    throw error; // Trigger retry
  }
}

const webhookWorker = new Worker('webhooks', deliverWebhook, {
  connection: redisConnection,
  concurrency: 10,
});

webhookWorker.on('completed', (job) => {
  console.log(`Webhook delivery ${job.id} completed`);
});

webhookWorker.on('failed', (job, err) => {
  console.error(`Webhook delivery ${job?.id} failed:`, err.message);
});

export default webhookWorker;
console.log('Webhook delivery worker started');
