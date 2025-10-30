import { createClient, RedisClientType } from 'redis';
import logger from './logger';
import { UserEvent } from '../types';

const client: RedisClientType = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
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

// Publish user events for cross-service communication
export const publishUserEvent = async (event: UserEvent): Promise<void> => {
  try {
    // Publish to a dedicated user events channel
    await client.publish('user_events', JSON.stringify(event));
    logger.info(
      `Published user event: ${event.eventType} for user ${event.userId}`
    );
  } catch (error) {
    logger.error('Error publishing user event:', error);
    throw error;
  }
};

export { client };
