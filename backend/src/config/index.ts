import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  tracking: {
    domain: process.env.TRACKING_DOMAIN || 'http://localhost:3001',
  },

  email: {
    defaultDailySendLimit: parseInt(process.env.DEFAULT_DAILY_SEND_LIMIT || '30', 10),
    warmupPoolSize: parseInt(process.env.WARMUP_POOL_SIZE || '100', 10),
  },
};
