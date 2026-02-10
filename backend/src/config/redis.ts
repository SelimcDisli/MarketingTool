import IORedis from 'ioredis';
import { config } from './index';

let redis: IORedis | null = null;

try {
  if (config.redis.url && config.redis.url !== 'redis://localhost:6379') {
    redis = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('Redis: max retries reached, running without Redis');
          return null; // Stop retrying
        }
        return Math.min(times * 500, 2000);
      },
    });

    redis.on('error', (err) => {
      console.warn('Redis connection error (non-fatal):', err.message);
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });
  } else {
    console.warn('⚠️  No Redis URL configured — queues/workers disabled. Server runs in API-only mode.');
  }
} catch (err) {
  console.warn('⚠️  Redis init failed — running without Redis:', err);
  redis = null;
}

export { redis };
export default redis;
