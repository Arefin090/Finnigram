const redis = require('redis');
const logger = require('./logger');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('connect', () => {
  logger.info('Redis connected successfully');
});

client.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

const connectRedis = async () => {
  try {
    await client.connect();
    logger.info('Redis client connected');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Cache message counts and recent messages
const cacheConversationData = async (conversationId, data) => {
  try {
    await client.setEx(`conversation:${conversationId}`, 300, JSON.stringify(data));
  } catch (error) {
    logger.error('Error caching conversation data:', error);
  }
};

const getCachedConversationData = async (conversationId) => {
  try {
    const data = await client.get(`conversation:${conversationId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Error getting cached conversation data:', error);
    return null;
  }
};

// Cache user's conversation list
const cacheUserConversations = async (userId, conversations) => {
  try {
    await client.setEx(`user:${userId}:conversations`, 300, JSON.stringify(conversations));
  } catch (error) {
    logger.error('Error caching user conversations:', error);
  }
};

const getCachedUserConversations = async (userId) => {
  try {
    const data = await client.get(`user:${userId}:conversations`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Error getting cached user conversations:', error);
    return null;
  }
};

// Invalidate cache when new messages arrive
const invalidateConversationCache = async (conversationId) => {
  try {
    await client.del(`conversation:${conversationId}`);
    
    // Also invalidate user conversation lists for all participants
    const { pool } = require('./database');
    const result = await pool.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );
    
    const promises = result.rows.map(row => 
      client.del(`user:${row.user_id}:conversations`)
    );
    
    await Promise.all(promises);
  } catch (error) {
    logger.error('Error invalidating conversation cache:', error);
  }
};

// Publish message events for real-time service
const publishMessage = async (event, data) => {
  try {
    await client.publish(event, JSON.stringify(data));
    logger.info(`Published message event: ${event}`);
  } catch (error) {
    logger.error('Error publishing message event:', error);
  }
};

module.exports = {
  client,
  connectRedis,
  cacheConversationData,
  getCachedConversationData,
  cacheUserConversations,
  getCachedUserConversations,
  invalidateConversationCache,
  publishMessage
};