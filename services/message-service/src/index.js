const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./utils/database');
const { connectRedis } = require('./utils/redis');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) } 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'message-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const { pool } = require('./utils/database');
    const { client: redisClient } = require('./utils/redis');
    
    // Get database stats
    const dbResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM conversations) as total_conversations,
        (SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL) as total_messages,
        (SELECT COUNT(*) FROM conversation_participants) as total_participants
    `);
    
    const stats = dbResult.rows[0];
    
    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      database: {
        totalConversations: parseInt(stats.total_conversations),
        totalMessages: parseInt(stats.total_messages),
        totalParticipants: parseInt(stats.total_participants)
      },
      redis: {
        connected: redisClient.isReady
      },
      timestamp: new Date().toISOString()
    });
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
    method: req.method 
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    
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

module.exports = app;