import { Queue } from 'bullmq';
import { config } from './index';

const connection = {
  host: new URL(config.redis.url).hostname || 'localhost',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
  password: new URL(config.redis.url).password || undefined,
};

export const emailQueue = new Queue('email-sending', { connection });
export const warmupQueue = new Queue('warmup', { connection });
export const replyQueue = new Queue('reply-processing', { connection });
export const analyticsQueue = new Queue('analytics', { connection });
export const webhookQueue = new Queue('webhooks', { connection });

export { connection as redisConnection };
