import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import logger from './utils/logger';
import { connectRedis, subscriber, getOnlineUsers } from './utils/redis';
import { socketAuth } from './middleware/auth';
import { handleMessageEvents, handleRedisEvents } from './events/messageEvents';
import {
  handleConnectionEvents,
  setupConnectionCleanup,
} from './events/connectionEvents';
import {
  AuthenticatedSocket,
  HealthStatus,
  MetricsResponse,
  ConversationRoom,
  SocketStatusResponse,
  SocketConnection,
} from './types';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3003;

// Express middleware
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
app.use(express.json());

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:19006',
    ],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true,
  transports: ['websocket', 'polling'],
});

// Socket authentication middleware
io.use(socketAuth);

// Handle socket connections
io.on('connection', socket => {
  const authSocket = socket as AuthenticatedSocket;
  logger.info(
    `New socket connection: ${socket.id} for user ${authSocket.user.username}`
  );

  // Set up event handlers
  handleConnectionEvents(io, authSocket);
  handleMessageEvents(io, authSocket);

  // Send initial connection success
  socket.emit('connected', {
    message: 'Connected to Finnigram real-time service',
    user: {
      id: authSocket.user.id,
      username: authSocket.user.username,
      displayName: authSocket.user.displayName,
    },
    timestamp: Date.now(),
  });
});

// Set up Redis pub/sub for cross-service communication
const setupRedisSubscriptions = (): void => {
  handleRedisEvents(io, subscriber);
  logger.info('Redis subscriptions set up');
};

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const connectedUsers = io.sockets.sockets.size;

  const healthStatus: HealthStatus = {
    status: 'healthy',
    service: 'realtime-service',
    connectedUsers,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  };

  res.json(healthStatus);
});

// Metrics endpoint
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    const connectedUsers = io.sockets.sockets.size;
    const onlineUsers = await getOnlineUsers();

    // Get room information
    const rooms: ConversationRoom[] = [];
    io.sockets.adapter.rooms.forEach((sockets, room) => {
      if (room.startsWith('conversation_')) {
        rooms.push({
          room,
          participants: sockets.size,
        });
      }
    });

    const metrics: MetricsResponse = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      websocket: {
        connectedSockets: connectedUsers,
        onlineUsers: onlineUsers.length,
        activeConversations: rooms.length,
        rooms: rooms.slice(0, 10), // Show first 10 rooms
      },
      timestamp: new Date().toISOString(),
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Socket.IO status endpoint
app.get('/socket-status', (req: Request, res: Response) => {
  const connectedUsers: SocketConnection[] = [];

  io.sockets.sockets.forEach(socket => {
    const authSocket = socket as AuthenticatedSocket;
    connectedUsers.push({
      socketId: socket.id,
      userId: authSocket.userId,
      username: authSocket.user?.username,
      currentConversation: authSocket.currentConversation,
      connected: socket.connected,
      lastHeartbeat: authSocket.lastHeartbeat,
    });
  });

  const response: SocketStatusResponse = {
    totalConnections: connectedUsers.length,
    connections: connectedUsers,
  };

  res.json(response);
});

// Error handling
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Express error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// Graceful shutdown
const gracefulShutdown = (): void => {
  logger.info('Shutting down gracefully...');

  // Close all socket connections
  io.sockets.sockets.forEach(socket => {
    socket.disconnect(true);
  });

  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Connect to Redis
    await connectRedis();

    // Set up Redis subscriptions
    setupRedisSubscriptions();

    // Set up connection cleanup
    setupConnectionCleanup(io);

    server.listen(PORT, () => {
      logger.info(`Real-time Service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('WebSocket server ready for connections');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { app, io };
