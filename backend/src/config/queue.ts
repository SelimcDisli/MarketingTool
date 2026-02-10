import { Queue } from 'bullmq';
import { config } from './index';

let connection: any = null;
let emailQueue: Queue | null = null;
let warmupQueue: Queue | null = null;
let replyQueue: Queue | null = null;
let analyticsQueue: Queue | null = null;
let webhookQueue: Queue | null = null;

try {
  const redisUrl = new URL(config.redis.url);
  connection = {
    host: redisUrl.hostname || 'localhost',
    port: parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
  };

  emailQueue = new Queue('email-sending', { connection });
  warmupQueue = new Queue('warmup', { connection });
  replyQueue = new Queue('reply-processing', { connection });
  analyticsQueue = new Queue('analytics', { connection });
  webhookQueue = new Queue('webhooks', { connection });

  console.log('✅ BullMQ queues initialized');
} catch (err) {
  console.warn('⚠️  BullMQ queues not initialized (Redis not available). Workers disabled.');
}

// Null-safe queue add helper
export async function safeQueueAdd(queue: Queue | null, name: string, data: any, opts?: any) {
  if (!queue) {
    console.warn(`Queue not available, skipping job: ${name}`);
    return null;
  }
  return queue.add(name, data, opts);
}

export { emailQueue, warmupQueue, replyQueue, analyticsQueue, webhookQueue };
export { connection as redisConnection };
