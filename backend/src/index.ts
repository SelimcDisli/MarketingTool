import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';

// Route imports
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import campaignRoutes from './routes/campaigns';
import leadRoutes from './routes/leads';
import uniboxRoutes from './routes/unibox';
import analyticsRoutes from './routes/analytics';
import crmRoutes from './routes/crm';
import webhookRoutes from './routes/webhooks';
import templateRoutes from './routes/templates';
import workspaceRoutes from './routes/workspace';
import trackingRoutes from './routes/tracking';

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: config.frontend.url,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tracking endpoints (no auth, no rate limit)
app.use('/t', trackingRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/unibox', uniboxRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/workspace', workspaceRoutes);

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`
  ⚡ Instantly Clone Backend running!
  📡 Server: http://localhost:${config.port}
  🔌 API:    http://localhost:${config.port}/api
  📊 Health: http://localhost:${config.port}/health
  🔍 Track:  http://localhost:${config.port}/t
  `);

  // Start Direct Sender (no Redis needed — works via setInterval)
  try {
    const { startDirectSender } = require('./workers/directSender');
    startDirectSender();
  } catch (err: any) {
    console.warn('  ⚠️  Direct sender failed to start:', err.message);
  }

  // Start BullMQ workers (optional — only if Redis is available)
  try {
    require('./workers/emailSender');
    require('./workers/warmup');
    require('./workers/replyProcessor');
    require('./workers/webhookDelivery');
    console.log('  ✅ BullMQ workers started (Redis available)');
  } catch (err: any) {
    console.warn('  ℹ️  BullMQ workers disabled (Redis not available). DirectSender is active.');
  }
});

export default app;
