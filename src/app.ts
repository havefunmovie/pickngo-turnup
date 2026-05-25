import './config/env';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { pool } from './infrastructure/database/pool';
import { connectRedis } from './infrastructure/cache/redis';
import { logger } from './infrastructure/logger';
import { requestLogger } from './api/middleware/request-logger';
import { errorHandler } from './api/middleware/error-handler';
import authRoutes from './api/routes/auth.routes';
import eventsRoutes from './api/routes/events.routes';
import ticketsRoutes from './api/routes/tickets.routes';
import venuesRoutes from './api/routes/venues.routes';
import campaignsRoutes from './api/routes/campaigns.routes';
import marketplaceRoutes from './api/routes/marketplace.routes';
import statsRoutes from './api/routes/stats.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

const publicLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_PUBLIC,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_WRITE,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'turnup' });
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', checks: { db: 'ok' } });
  } catch {
    res.status(503).json({ status: 'not ready', checks: { db: 'error' } });
  }
});

app.use('/api/v1/auth', writeLimiter, authRoutes);
app.use('/api/v1/events', publicLimiter, eventsRoutes);
app.use('/api/v1/tickets', authLimiter, ticketsRoutes);
app.use('/api/v1/venues', authLimiter, venuesRoutes);
app.use('/api/v1/campaigns', writeLimiter, campaignsRoutes);
app.use('/api/v1/marketplace', publicLimiter, marketplaceRoutes);
app.use('/api/v1/stats', authLimiter, statsRoutes);

app.use(errorHandler);

async function start() {
  try {
    await connectRedis();
    logger.info('Redis connected');

    await pool.query('SELECT 1');
    logger.info('Database connected');

    app.listen(env.PORT, () => {
      logger.info(`TurnUp service running on port ${env.PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start service', { err });
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

start();

export default app;
