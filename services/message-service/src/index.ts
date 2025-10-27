import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import logger from './utils/logger';
import { connectRedis, client as redisClient } from './utils/redis';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import errorHandler from './middleware/errorHandler';
import { HealthStatus, MetricsResponse } from './types';

const app = express();
const PORT = process.env.PORT || 3002;
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:19006',
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

// Routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus: HealthStatus = {
    status: 'healthy',
    service: 'message-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  };

  res.json(healthStatus);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    // Get database stats using Prisma
    const [totalConversations, totalMessages, totalParticipants] =
      await Promise.all([
        prisma.conversation.count(),
        prisma.message.count({
          where: { deletedAt: null },
        }),
        prisma.conversationParticipant.count(),
      ]);

    const metrics: MetricsResponse = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      database: {
        totalConversations,
        totalMessages,
        totalParticipants,
      },
      redis: {
        connected: redisClient.isReady,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');

  try {
    // Disconnect Prisma
    await prisma.$disconnect();
    logger.info('Prisma disconnected');

    // Other cleanup can go here

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
    // Test Prisma connection
    await prisma.$connect();
    logger.info('Prisma connected successfully');

    // Connect to Redis
    await connectRedis();

    app.listen(PORT, () => {
      logger.info(`Message Service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
