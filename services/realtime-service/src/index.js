const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const logger = require('./utils/logger');
const { connectRedis, subscriber } = require('./utils/redis');
const { socketAuth } = require('./middleware/auth');
const { handleMessageEvents, handleRedisEvents } = require('./events/messageEvents');
const { handleConnectionEvents, setupConnectionCleanup } = require('./events/connectionEvents');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3003;

// Express middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:19006'],
  credentials: true
}));
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) } 
}));
app.use(express.json());

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:19006'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true,
  transports: ['websocket', 'polling']
});

// Socket authentication middleware
io.use(socketAuth);

// Handle socket connections
io.on('connection', (socket) => {
  logger.info(`New socket connection: ${socket.id} for user ${socket.user.username}`);
  
  // Set up event handlers
  handleConnectionEvents(io, socket);
  handleMessageEvents(io, socket);
  
  // Send initial connection success
  socket.emit('connected', {
    message: 'Connected to Finnigram real-time service',
    user: {
      id: socket.user.id,
      username: socket.user.username,
      displayName: socket.user.displayName
    },
    timestamp: Date.now()
  });
});

// Set up Redis pub/sub for cross-service communication
const setupRedisSubscriptions = () => {
  handleRedisEvents(io, subscriber);
  logger.info('Redis subscriptions set up');
};

// Health check endpoint
app.get('/health', (req, res) => {
  const connectedUsers = io.sockets.sockets.size;
  
  res.json({ 
    status: 'healthy', 
    service: 'realtime-service',
    connectedUsers,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const connectedUsers = io.sockets.sockets.size;
    const { getOnlineUsers } = require('./utils/redis');
    const onlineUsers = await getOnlineUsers();
    
    // Get room information
    const rooms = [];
    io.sockets.adapter.rooms.forEach((sockets, room) => {
      if (room.startsWith('conversation_')) {
        rooms.push({
          room,
          participants: sockets.size
        });
      }
    });
    
    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      websocket: {
        connectedSockets: connectedUsers,
        onlineUsers: onlineUsers.length,
        activeConversations: rooms.length,
        rooms: rooms.slice(0, 10) // Show first 10 rooms
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Socket.IO status endpoint
app.get('/socket-status', (req, res) => {
  const connectedUsers = [];
  
  io.sockets.sockets.forEach((socket) => {
    connectedUsers.push({
      socketId: socket.id,
      userId: socket.userId,
      username: socket.user?.username,
      currentConversation: socket.currentConversation,
      connected: socket.connected,
      lastHeartbeat: socket.lastHeartbeat
    });
  });
  
  res.json({
    totalConnections: connectedUsers.length,
    connections: connectedUsers
  });
});

// Error handling
app.use((error, req, res, next) => {
  logger.error('Express error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method 
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Shutting down gracefully...');
  
  // Close all socket connections
  io.sockets.sockets.forEach((socket) => {
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
const startServer = async () => {
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

module.exports = { app, io };