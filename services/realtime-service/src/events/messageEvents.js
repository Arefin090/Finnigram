const axios = require('axios');
const logger = require('../utils/logger');
const { 
  setUserTyping, 
  setUserStoppedTyping, 
  getTypingUsers,
  publishMessage,
  publishMessageUpdate,
  publishMessageDelete
} = require('../utils/redis');

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3002';

const handleMessageEvents = (io, socket) => {
  
  // Join conversation rooms
  socket.on('join_conversation', async (conversationId) => {
    try {
      // Verify user has access to this conversation
      const response = await axios.get(
        `${MESSAGE_SERVICE_URL}/api/conversations/${conversationId}`,
        { headers: { Authorization: `Bearer ${socket.handshake.auth.token}` } }
      );
      
      socket.join(`conversation_${conversationId}`);
      socket.currentConversation = conversationId;
      
      logger.info(`User ${socket.userId} joined conversation ${conversationId}`);
      
      // Send current typing users
      const typingUsers = await getTypingUsers(conversationId);
      socket.emit('typing_users', { conversationId, typingUsers });
      
    } catch (error) {
      logger.error('Error joining conversation:', error);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  });

  // Leave conversation rooms
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    socket.currentConversation = null;
    
    // Stop typing if user was typing
    setUserStoppedTyping(socket.userId, conversationId);
    
    logger.info(`User ${socket.userId} left conversation ${conversationId}`);
  });

  // Handle typing indicators
  socket.on('typing_start', async (data) => {
    const { conversationId } = data;
    
    if (!conversationId) return;
    
    await setUserTyping(socket.userId, conversationId);
    
    // Broadcast to other users in the conversation
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      username: socket.user.username,
      conversationId,
      isTyping: true
    });
  });

  socket.on('typing_stop', async (data) => {
    const { conversationId } = data;
    
    if (!conversationId) return;
    
    await setUserStoppedTyping(socket.userId, conversationId);
    
    // Broadcast to other users in the conversation
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      username: socket.user.username,
      conversationId,
      isTyping: false
    });
  });

  // Handle message read receipts
  socket.on('mark_read', async (data) => {
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
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error marking conversation as read:', error);
    }
  });

  // Handle message reactions (future feature)
  socket.on('message_reaction', async (data) => {
    const { messageId, reaction, conversationId } = data;
    
    // TODO: Implement message reactions in message service
    // For now, just broadcast the reaction
    socket.to(`conversation_${conversationId}`).emit('message_reaction', {
      messageId,
      userId: socket.userId,
      username: socket.user.username,
      reaction,
      timestamp: Date.now()
    });
  });

  // Handle user status updates
  socket.on('update_status', (data) => {
    const { status } = data; // online, away, busy, invisible
    
    // Broadcast status update to all connected users
    socket.broadcast.emit('user_status_update', {
      userId: socket.userId,
      username: socket.user.username,
      status,
      timestamp: Date.now()
    });
    
    logger.info(`User ${socket.userId} updated status to: ${status}`);
  });
};

// Handle Redis pub/sub events for message broadcasting
const handleRedisEvents = (io, subscriber) => {
  
  // New message event
  subscriber.subscribe('new_message', (message) => {
    const messageData = JSON.parse(message);
    
    // Broadcast to all users in the conversation
    io.to(`conversation_${messageData.conversation_id}`).emit('new_message', messageData);
    
    logger.info(`Broadcasted new message ${messageData.id} to conversation ${messageData.conversation_id}`);
  });

  // Message updated event
  subscriber.subscribe('message_updated', (message) => {
    const messageData = JSON.parse(message);
    
    // Broadcast to all users in the conversation
    io.to(`conversation_${messageData.conversation_id}`).emit('message_updated', messageData);
    
    logger.info(`Broadcasted message update ${messageData.id}`);
  });

  // Message deleted event
  subscriber.subscribe('message_deleted', (message) => {
    const deleteData = JSON.parse(message);
    
    // Broadcast to all users in the conversation
    io.to(`conversation_${deleteData.conversationId}`).emit('message_deleted', deleteData);
    
    logger.info(`Broadcasted message deletion ${deleteData.messageId}`);
  });

  // User presence events
  subscriber.subscribe('user_presence', (message) => {
    const presenceData = JSON.parse(message);
    
    // Broadcast presence update to all connected users
    io.emit('user_presence_update', presenceData);
  });

  // Typing indicator events
  subscriber.subscribe('typing_indicator', (message) => {
    const typingData = JSON.parse(message);
    
    // Broadcast typing indicator to conversation participants
    io.to(`conversation_${typingData.conversationId}`).emit('typing_indicator', typingData);
  });
};

module.exports = { handleMessageEvents, handleRedisEvents };