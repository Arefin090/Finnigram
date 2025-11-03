import axios from 'axios';
import { Server } from 'socket.io';
import { RedisClientType } from 'redis';
import logger from '../utils/logger';
import {
  setUserTyping,
  setUserStoppedTyping,
  getTypingUsers,
} from '../utils/redis';
import {
  AuthenticatedSocket,
  TypingData,
  MarkReadData,
  MessageReactionData,
  UpdateStatusData,
  MessageServiceConversationResponse,
  Message,
  RedisPresenceMessage,
  RedisTypingMessage,
  RedisConversationCreatedMessage,
  RedisMessageDeliveredMessage,
  RedisMessageReadMessage,
  RedisConversationReadMessage,
  RedisMessageDeleteMessage,
} from '../types';

const MESSAGE_SERVICE_URL =
  process.env.MESSAGE_SERVICE_URL || 'http://localhost:3002';

const handleMessageEvents = (io: Server, socket: AuthenticatedSocket): void => {
  // Join conversation rooms
  socket.on('join_conversation', async (conversationId: number) => {
    try {
      // Verify user has access to this conversation
      await axios.get<MessageServiceConversationResponse>(
        `${MESSAGE_SERVICE_URL}/api/conversations/${conversationId}`,
        { headers: { Authorization: `Bearer ${socket.handshake.auth.token}` } }
      );

      socket.join(`conversation_${conversationId}`);
      socket.currentConversation = conversationId;

      logger.info(
        `User ${socket.userId} joined conversation ${conversationId}`
      );

      // Send current typing users
      const typingUsers = await getTypingUsers(conversationId);
      socket.emit('typing_users', { conversationId, typingUsers });
    } catch (error) {
      logger.error('Error joining conversation:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  });

  // Leave conversation rooms
  socket.on('leave_conversation', (conversationId: number) => {
    socket.leave(`conversation_${conversationId}`);
    socket.currentConversation = undefined;

    // Stop typing if user was typing
    setUserStoppedTyping(socket.userId, conversationId);

    logger.info(`User ${socket.userId} left conversation ${conversationId}`);
  });

  // Handle typing indicators
  socket.on('typing_start', async (data: TypingData) => {
    const { conversationId } = data;

    if (!conversationId) return;

    await setUserTyping(socket.userId, conversationId);

    // Broadcast to other users in the conversation
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      username: socket.user.username,
      conversationId,
      isTyping: true,
    });
  });

  socket.on('typing_stop', async (data: TypingData) => {
    const { conversationId } = data;

    if (!conversationId) return;

    await setUserStoppedTyping(socket.userId, conversationId);

    // Broadcast to other users in the conversation
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      username: socket.user.username,
      conversationId,
      isTyping: false,
    });
  });

  // Handle message read receipts
  socket.on('mark_read', async (data: MarkReadData) => {
    const { conversationId } = data;

    try {
      await axios.patch(
        `${MESSAGE_SERVICE_URL}/api/conversations/${conversationId}/read`,
        {},
        { headers: { Authorization: `Bearer ${socket.handshake.auth.token}` } }
      );

      // Broadcast read receipt to other users
      socket.to(`conversation_${conversationId}`).emit('message_read', {
        userId: socket.userId,
        conversationId,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Error marking conversation as read:', error);
    }
  });

  // Handle message reactions (future feature)
  socket.on('message_reaction', async (data: MessageReactionData) => {
    const { messageId, reaction, conversationId } = data;

    // TODO: Implement message reactions in message service
    // For now, just broadcast the reaction
    socket.to(`conversation_${conversationId}`).emit('message_reaction', {
      messageId,
      userId: socket.userId,
      username: socket.user.username,
      reaction,
      timestamp: Date.now(),
    });
  });

  // Handle user status updates
  socket.on('update_status', (data: UpdateStatusData) => {
    const { status } = data; // online, away, busy, invisible

    // Broadcast status update to all connected users
    socket.broadcast.emit('user_status_update', {
      userId: socket.userId,
      username: socket.user.username,
      status,
      timestamp: Date.now(),
    });

    logger.info(`User ${socket.userId} updated status to: ${status}`);
  });
};

// Handle Redis pub/sub events for message broadcasting
const handleRedisEvents = (io: Server, subscriber: RedisClientType): void => {
  // New message event
  subscriber.subscribe('new_message', (message: string) => {
    const messageData: Message = JSON.parse(message);

    // Broadcast to all users in the conversation, including the sender
    io.in(`conversation_${messageData.conversation_id}`).emit(
      'new_message',
      messageData
    );

    logger.info(
      `Broadcasted new message ${messageData.id} to conversation ${messageData.conversation_id} (including sender)`
    );
  });

  // Message updated event
  subscriber.subscribe('message_updated', (message: string) => {
    const messageData: Message = JSON.parse(message);

    // Broadcast to all users in the conversation, including the sender
    io.in(`conversation_${messageData.conversation_id}`).emit(
      'message_updated',
      messageData
    );

    logger.info(
      `Broadcasted message update ${messageData.id} (including sender)`
    );
  });

  // Message deleted event
  subscriber.subscribe('message_deleted', (message: string) => {
    const deleteData: RedisMessageDeleteMessage = JSON.parse(message);

    // Broadcast to all users in the conversation, including the sender
    io.in(`conversation_${deleteData.conversationId}`).emit(
      'message_deleted',
      deleteData
    );

    logger.info(
      `Broadcasted message deletion ${deleteData.messageId} (including sender)`
    );
  });

  // User presence events
  subscriber.subscribe('user_presence', (message: string) => {
    const presenceData: RedisPresenceMessage = JSON.parse(message);

    // Broadcast presence update to all connected users
    io.emit('user_presence_update', presenceData);
  });

  // Typing indicator events
  subscriber.subscribe('typing_indicator', (message: string) => {
    const typingData: RedisTypingMessage = JSON.parse(message);

    // Broadcast typing indicator to conversation participants
    io.to(`conversation_${typingData.conversationId}`).emit(
      'typing_indicator',
      typingData
    );
  });

  // Conversation created event
  subscriber.subscribe('conversation_created', (message: string) => {
    const { userId, conversation }: RedisConversationCreatedMessage =
      JSON.parse(message);

    // Find the specific user's socket and emit the event
    const userSockets = Array.from(io.sockets.sockets.values()).filter(
      socket => (socket as AuthenticatedSocket).userId === userId
    );

    userSockets.forEach(socket => {
      socket.emit('conversation_created', conversation);
    });

    logger.info(
      `Broadcasted new conversation ${conversation.id} to user ${userId}`
    );
  });

  // Message delivery status events
  subscriber.subscribe('message_delivered', (message: string) => {
    const deliveryData: RedisMessageDeliveredMessage = JSON.parse(message);

    // Broadcast delivery status to the conversation (excluding the user who marked it as delivered)
    const sockets = Array.from(io.sockets.sockets.values()).filter(socket => {
      const authSocket = socket as AuthenticatedSocket;
      return (
        authSocket.currentConversation === deliveryData.conversationId &&
        authSocket.userId !== deliveryData.userId
      );
    });

    sockets.forEach(socket => {
      socket.emit('message_delivered', {
        messageId: deliveryData.messageId,
        conversationId: deliveryData.conversationId,
        deliveredAt: deliveryData.deliveredAt,
      });
    });

    logger.info(
      `Broadcasted message delivery status for message ${deliveryData.messageId}`
    );
  });

  // Message read status events
  subscriber.subscribe('message_read', (message: string) => {
    const readData: RedisMessageReadMessage = JSON.parse(message);

    // Broadcast read status to the conversation (excluding the user who marked it as read)
    const sockets = Array.from(io.sockets.sockets.values()).filter(socket => {
      const authSocket = socket as AuthenticatedSocket;
      return (
        authSocket.currentConversation === readData.conversationId &&
        authSocket.userId !== readData.userId
      );
    });

    sockets.forEach(socket => {
      socket.emit('message_read', {
        messageId: readData.messageId,
        conversationId: readData.conversationId,
        readAt: readData.readAt,
      });
    });

    logger.info(
      `Broadcasted message read status for message ${readData.messageId}`
    );
  });

  // Conversation read status events (when all messages in conversation are marked as read)
  subscriber.subscribe('conversation_read', (message: string) => {
    const readData: RedisConversationReadMessage = JSON.parse(message);

    // Broadcast conversation read status to the conversation (excluding the user who marked it as read)
    const sockets = Array.from(io.sockets.sockets.values()).filter(socket => {
      const authSocket = socket as AuthenticatedSocket;
      return (
        authSocket.currentConversation === readData.conversationId &&
        authSocket.userId !== readData.userId
      );
    });

    sockets.forEach(socket => {
      socket.emit('conversation_read', {
        conversationId: readData.conversationId,
        messageIds: readData.messageIds,
        readAt: readData.readAt,
      });
    });

    logger.info(
      `Broadcasted conversation read status for conversation ${readData.conversationId} (${readData.messageIds.length} messages)`
    );
  });
};

export { handleMessageEvents, handleRedisEvents };
