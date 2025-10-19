const redis = require('redis');
const logger = require('./logger');

// Create Redis clients for different purposes
const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

const publisher = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

const subscriber = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Event handlers
client.on('connect', () => logger.info('Redis client connected'));
client.on('error', (err) => logger.error('Redis client error:', err));

publisher.on('connect', () => logger.info('Redis publisher connected'));
publisher.on('error', (err) => logger.error('Redis publisher error:', err));

subscriber.on('connect', () => logger.info('Redis subscriber connected'));
subscriber.on('error', (err) => logger.error('Redis subscriber error:', err));

const connectRedis = async () => {
  try {
    await Promise.all([
      client.connect(),
      publisher.connect(),
      subscriber.connect()
    ]);
    logger.info('All Redis clients connected successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// User presence management
const setUserOnline = async (userId, socketId) => {
  try {
    await client.hSet(`user:${userId}:presence`, {
      status: 'online',
      socketId,
      lastSeen: Date.now()
    });
    
    await client.sAdd('online_users', userId.toString());
    
    // Publish presence update
    await publisher.publish('user_presence', JSON.stringify({
      userId,
      status: 'online',
      timestamp: Date.now()
    }));
    
    logger.info(`User ${userId} set online with socket ${socketId}`);
  } catch (error) {
    logger.error('Error setting user online:', error);
  }
};

const setUserOffline = async (userId) => {
  try {
    await client.hSet(`user:${userId}:presence`, {
      status: 'offline',
      lastSeen: Date.now()
    });
    
    await client.sRem('online_users', userId.toString());
    
    // Publish presence update
    await publisher.publish('user_presence', JSON.stringify({
      userId,
      status: 'offline',
      timestamp: Date.now()
    }));
    
    logger.info(`User ${userId} set offline`);
  } catch (error) {
    logger.error('Error setting user offline:', error);
  }
};

const getUserPresence = async (userId) => {
  try {
    const presence = await client.hGetAll(`user:${userId}:presence`);
    return presence.status ? presence : { status: 'offline', lastSeen: 0 };
  } catch (error) {
    logger.error('Error getting user presence:', error);
    return { status: 'offline', lastSeen: 0 };
  }
};

const getOnlineUsers = async () => {
  try {
    const userIds = await client.sMembers('online_users');
    return userIds.map(id => parseInt(id));
  } catch (error) {
    logger.error('Error getting online users:', error);
    return [];
  }
};

// Typing indicators
const setUserTyping = async (userId, conversationId) => {
  try {
    await client.setEx(`typing:${conversationId}:${userId}`, 10, '1');
    
    // Publish typing event
    await publisher.publish('typing_indicator', JSON.stringify({
      userId,
      conversationId,
      isTyping: true,
      timestamp: Date.now()
    }));
  } catch (error) {
    logger.error('Error setting user typing:', error);
  }
};

const setUserStoppedTyping = async (userId, conversationId) => {
  try {
    await client.del(`typing:${conversationId}:${userId}`);
    
    // Publish typing stopped event
    await publisher.publish('typing_indicator', JSON.stringify({
      userId,
      conversationId,
      isTyping: false,
      timestamp: Date.now()
    }));
  } catch (error) {
    logger.error('Error setting user stopped typing:', error);
  }
};

const getTypingUsers = async (conversationId) => {
  try {
    const pattern = `typing:${conversationId}:*`;
    const keys = await client.keys(pattern);
    
    const typingUsers = keys.map(key => {
      const userId = key.split(':').pop();
      return parseInt(userId);
    });
    
    return typingUsers;
  } catch (error) {
    logger.error('Error getting typing users:', error);
    return [];
  }
};

// Message broadcasting
const publishMessage = async (message) => {
  try {
    await publisher.publish('new_message', JSON.stringify(message));
    logger.info(`Message published: ${message.id}`);
  } catch (error) {
    logger.error('Error publishing message:', error);
  }
};

const publishMessageUpdate = async (message) => {
  try {
    await publisher.publish('message_updated', JSON.stringify(message));
    logger.info(`Message update published: ${message.id}`);
  } catch (error) {
    logger.error('Error publishing message update:', error);
  }
};

const publishMessageDelete = async (messageId, conversationId) => {
  try {
    await publisher.publish('message_deleted', JSON.stringify({
      messageId,
      conversationId,
      timestamp: Date.now()
    }));
    logger.info(`Message deletion published: ${messageId}`);
  } catch (error) {
    logger.error('Error publishing message deletion:', error);
  }
};

module.exports = {
  client,
  publisher,
  subscriber,
  connectRedis,
  setUserOnline,
  setUserOffline,
  getUserPresence,
  getOnlineUsers,
  setUserTyping,
  setUserStoppedTyping,
  getTypingUsers,
  publishMessage,
  publishMessageUpdate,
  publishMessageDelete
};