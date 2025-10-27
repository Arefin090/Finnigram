import { Server } from 'socket.io';
import logger from '../utils/logger';
import {
  setUserOnline,
  setUserOffline,
  getOnlineUsers,
  setUserStoppedTyping,
} from '../utils/redis';
import { AuthenticatedSocket } from '../types';

const handleConnectionEvents = (
  io: Server,
  socket: AuthenticatedSocket
): void => {
  // Handle initial connection
  socket.on('connect', async () => {
    logger.info(
      `User ${socket.user.username} connected with socket ${socket.id}`
    );
  });

  // Handle user coming online
  socket.on('user_online', async () => {
    await setUserOnline(socket.userId, socket.id);

    // Send current online users to the newly connected user
    const onlineUsers = await getOnlineUsers();
    socket.emit('online_users', onlineUsers);

    logger.info(`User ${socket.userId} is now online`);
  });

  // Handle disconnection
  socket.on('disconnect', async (reason: string) => {
    logger.info(`User ${socket.user.username} disconnected: ${reason}`);

    // Set user offline
    await setUserOffline(socket.userId);

    // Stop typing in current conversation if any
    if (socket.currentConversation) {
      await setUserStoppedTyping(socket.userId, socket.currentConversation);

      // Notify other users in the conversation
      socket
        .to(`conversation_${socket.currentConversation}`)
        .emit('user_typing', {
          userId: socket.userId,
          username: socket.user.username,
          conversationId: socket.currentConversation,
          isTyping: false,
        });
    }
  });

  // Handle connection errors
  socket.on('error', (error: Error) => {
    logger.error(`Socket error for user ${socket.user.username}:`, error);
  });

  // Handle ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Handle client heartbeat
  socket.on('heartbeat', () => {
    socket.lastHeartbeat = Date.now();
  });
};

// Clean up inactive connections
const setupConnectionCleanup = (io: Server): void => {
  setInterval(() => {
    const now = Date.now();
    const timeout = 60000; // 1 minute timeout

    io.sockets.sockets.forEach(socket => {
      const authSocket = socket as AuthenticatedSocket;
      if (
        authSocket.lastHeartbeat &&
        now - authSocket.lastHeartbeat > timeout
      ) {
        logger.warn(
          `Disconnecting inactive socket for user ${authSocket.user?.username}`
        );
        socket.disconnect(true);
      }
    });
  }, 30000); // Check every 30 seconds
};

export { handleConnectionEvents, setupConnectionCleanup };
