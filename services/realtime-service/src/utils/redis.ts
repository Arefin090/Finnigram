import { createClient, RedisClientType } from 'redis';
import logger from './logger';
import { UserPresence, Message, RedisPresenceMessage } from '../types';

// Create Redis clients for different purposes
const client: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

const publisher: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

const subscriber: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

// Event handlers
client.on('connect', () => logger.info('Redis client connected'));
client.on('error', (err: Error) => logger.error('Redis client error:', err));

publisher.on('connect', () => logger.info('Redis publisher connected'));
publisher.on('error', (err: Error) =>
  logger.error('Redis publisher error:', err)
);

subscriber.on('connect', () => logger.info('Redis subscriber connected'));
subscriber.on('error', (err: Error) =>
  logger.error('Redis subscriber error:', err)
);

const connectRedis = async (): Promise<void> => {
  try {
    await Promise.all([
      client.connect(),
      publisher.connect(),
      subscriber.connect(),
    ]);
    logger.info('All Redis clients connected successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// User presence management
const setUserOnline = async (
  userId: number,
  socketId: string
): Promise<void> => {
  try {
    await client.hSet(`user:${userId}:presence`, {
      status: 'online',
      socketId,
      lastSeen: Date.now().toString(),
    });

    await client.sAdd('online_users', userId.toString());

    // Publish presence update
    const presenceMessage: RedisPresenceMessage = {
      userId,
      status: 'online',
      timestamp: Date.now(),
    };

    await publisher.publish('user_presence', JSON.stringify(presenceMessage));

    logger.info(`User ${userId} set online with socket ${socketId}`);
  } catch (error) {
    logger.error('Error setting user online:', error);
  }
};

const setUserOffline = async (userId: number): Promise<void> => {
  try {
    await client.hSet(`user:${userId}:presence`, {
      status: 'offline',
      lastSeen: Date.now().toString(),
    });

    await client.sRem('online_users', userId.toString());

    // Publish presence update
    const presenceMessage: RedisPresenceMessage = {
      userId,
      status: 'offline',
      timestamp: Date.now(),
    };

    await publisher.publish('user_presence', JSON.stringify(presenceMessage));

    logger.info(`User ${userId} set offline`);
  } catch (error) {
    logger.error('Error setting user offline:', error);
  }
};

const getUserPresence = async (userId: number): Promise<UserPresence> => {
  try {
    const presence = await client.hGetAll(`user:${userId}:presence`);

    if (presence.status) {
      return {
        status: presence.status as UserPresence['status'],
        socketId: presence.socketId,
        lastSeen: parseInt(presence.lastSeen) || 0,
      };
    }

    return { status: 'offline', lastSeen: 0 };
  } catch (error) {
    logger.error('Error getting user presence:', error);
    return { status: 'offline', lastSeen: 0 };
  }
};

const getOnlineUsers = async (): Promise<number[]> => {
  try {
    const userIds = await client.sMembers('online_users');
    return userIds.map(id => parseInt(id));
  } catch (error) {
    logger.error('Error getting online users:', error);
    return [];
  }
};

// Typing indicators
const setUserTyping = async (
  userId: number,
  conversationId: number
): Promise<void> => {
  try {
    await client.setEx(`typing:${conversationId}:${userId}`, 10, '1');

    // Publish typing event
    await publisher.publish(
      'typing_indicator',
      JSON.stringify({
        userId,
        conversationId,
        isTyping: true,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    logger.error('Error setting user typing:', error);
  }
};

const setUserStoppedTyping = async (
  userId: number,
  conversationId: number
): Promise<void> => {
  try {
    await client.del(`typing:${conversationId}:${userId}`);

    // Publish typing stopped event
    await publisher.publish(
      'typing_indicator',
      JSON.stringify({
        userId,
        conversationId,
        isTyping: false,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    logger.error('Error setting user stopped typing:', error);
  }
};

const getTypingUsers = async (conversationId: number): Promise<number[]> => {
  try {
    const pattern = `typing:${conversationId}:*`;
    const keys = await client.keys(pattern);

    const typingUsers = keys
      .map(key => {
        const userId = key.split(':').pop();
        return parseInt(userId || '0');
      })
      .filter(id => id > 0);

    return typingUsers;
  } catch (error) {
    logger.error('Error getting typing users:', error);
    return [];
  }
};

// Message broadcasting
const publishMessage = async (message: Message): Promise<void> => {
  try {
    await publisher.publish('new_message', JSON.stringify(message));
    logger.info(`Message published: ${message.id}`);
  } catch (error) {
    logger.error('Error publishing message:', error);
  }
};

const publishMessageUpdate = async (message: Message): Promise<void> => {
  try {
    await publisher.publish('message_updated', JSON.stringify(message));
    logger.info(`Message update published: ${message.id}`);
  } catch (error) {
    logger.error('Error publishing message update:', error);
  }
};

const publishMessageDelete = async (
  messageId: number,
  conversationId: number
): Promise<void> => {
  try {
    await publisher.publish(
      'message_deleted',
      JSON.stringify({
        messageId,
        conversationId,
        timestamp: Date.now(),
      })
    );
    logger.info(`Message deletion published: ${messageId}`);
  } catch (error) {
    logger.error('Error publishing message deletion:', error);
  }
};

export {
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
  publishMessageDelete,
};
