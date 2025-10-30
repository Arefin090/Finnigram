import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import logger from './utils/logger';
import { initializeDatabase, disconnectDatabase } from './utils/database';
import { connectRedis, client as redisClient } from './utils/redis';
import OutboxRelayService from './services/OutboxRelayService';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import errorHandler from './middleware/errorHandler';
import { HealthStatus, MetricsResponse } from './types';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:19006',
      'http://localhost:8081',
    ],
    credentials: true,
  })
);
app.use(
  morgan('combined', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint for Railway health check
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Get outbox relay statistics
    const outboxStats = await OutboxRelayService.getStats();

    const healthStatus: HealthStatus & { outboxStats?: typeof outboxStats } = {
      status: 'healthy',
      service: 'user-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      outboxStats,
    };

    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      service: 'user-service',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// Metrics endpoint (basic)
app.get('/metrics', (req: Request, res: Response) => {
  const metrics: MetricsResponse = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
  };

  res.json(metrics);
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  logger.info('Starting graceful shutdown...');

  try {
    // Stop outbox relay service
    OutboxRelayService.stop();
    logger.info('Outbox relay service stopped');

    // Disconnect from Redis
    await redisClient.disconnect();
    logger.info('Redis disconnected');

    // Disconnect from database
    await disconnectDatabase();
    logger.info('Database disconnected');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async (): Promise<void> => {
  try {
    logger.info('Starting User Service...');
    logger.info(
      `DATABASE_URL configured: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`
    );
    logger.info(
      `REDIS_URL configured: ${process.env.REDIS_URL ? 'Yes' : 'No'}`
    );
    logger.info(
      `JWT_SECRET configured: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`
    );
    logger.info(`PORT: ${PORT}`);

    // Initialize database first (like message-service)
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Initialize Redis
    await connectRedis();
    logger.info('Redis initialized successfully');

    // Start the outbox relay service
    OutboxRelayService.start();
    logger.info('Outbox relay service started');

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`User Service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Add periodic health logging
    setInterval(() => {
      logger.info(`Service health check - uptime: ${process.uptime()}s`);
    }, 30000);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
