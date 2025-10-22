import { createClient, RedisClientType } from 'redis';
import logger from './logger';
import { PrismaClient } from '@prisma/client';

const client: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('connect', () => {
  logger.info('Redis connected successfully');
});

client.on('error', (err: Error) => {
  logger.error('Redis connection error:', err);
});

export const connectRedis = async (): Promise<void> => {
  try {
    await client.connect();
    logger.info('Redis client connected');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Cache message counts and recent messages
export const cacheConversationData = async (conversationId: number, data: any): Promise<void> => {
  try {
    await client.setEx(`conversation:${conversationId}`, 300, JSON.stringify(data));
  } catch (error) {
    logger.error('Error caching conversation data:', error);
  }
};

export const getCachedConversationData = async (conversationId: number): Promise<any | null> => {
  try {
    const data = await client.get(`conversation:${conversationId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Error getting cached conversation data:', error);
    return null;
  }
};

// Cache user's conversation list
export const cacheUserConversations = async (userId: number, conversations: any): Promise<void> => {
  try {
    await client.setEx(`user:${userId}:conversations`, 300, JSON.stringify(conversations));
  } catch (error) {
    logger.error('Error caching user conversations:', error);
  }
};

export const getCachedUserConversations = async (userId: number): Promise<any | null> => {
  try {
    const data = await client.get(`user:${userId}:conversations`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Error getting cached user conversations:', error);
    return null;
  }
};

// Invalidate cache when new messages arrive
export const invalidateConversationCache = async (conversationId: number): Promise<void> => {
  try {
    await client.del(`conversation:${conversationId}`);
    
    // Also invalidate user conversation lists for all participants
    // We'll need to get prisma instance from the service layer for this
    const prisma = new PrismaClient();
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true }
    });
    
    const promises = participants.map(participant => 
      client.del(`user:${participant.userId}:conversations`)
    );
    
    await Promise.all(promises);
    await prisma.$disconnect();
  } catch (error) {
    logger.error('Error invalidating conversation cache:', error);
  }
};

// Publish message events for real-time service
export const publishMessage = async (event: string, data: any): Promise<void> => {
  try {
    await client.publish(event, JSON.stringify(data));
    logger.info(`Published message event: ${event}`);
  } catch (error) {
    logger.error('Error publishing message event:', error);
  }
};

export { client };