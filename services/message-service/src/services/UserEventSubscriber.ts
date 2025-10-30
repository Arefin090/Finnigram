import { createClient, RedisClientType } from 'redis';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { client as redisClient } from '../utils/redis';
import {
  UserEvent,
  UserCreatedEvent,
  UserUpdatedEvent,
  UserDeletedEvent,
} from '../types';

class UserEventSubscriber {
  private subscriber: RedisClientType;
  private prisma: PrismaClient;
  private isConnected = false;

  constructor() {
    this.subscriber = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.prisma = new PrismaClient();

    this.subscriber.on('connect', () => {
      logger.info('User event subscriber Redis connected successfully');
    });

    this.subscriber.on('error', (err: Error) => {
      logger.error('User event subscriber Redis connection error:', err);
    });
  }

  // Start subscribing to user events
  async start(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.subscriber.connect();
        this.isConnected = true;
      }

      // Subscribe to the user_events channel
      await this.subscriber.subscribe('user_events', message => {
        this.handleUserEvent(message);
      });

      logger.info(
        'User event subscriber started, listening to user_events channel'
      );
    } catch (error) {
      logger.error('Failed to start user event subscriber:', error);
      throw error;
    }
  }

  // Stop the subscriber
  async stop(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.subscriber.unsubscribe('user_events');
        await this.subscriber.disconnect();
        this.isConnected = false;
      }
      await this.prisma.$disconnect();
      logger.info('User event subscriber stopped');
    } catch (error) {
      logger.error('Error stopping user event subscriber:', error);
    }
  }

  // Handle incoming user events
  private async handleUserEvent(message: string): Promise<void> {
    try {
      const userEvent: UserEvent = JSON.parse(message);

      logger.info(
        `Received user event: ${userEvent.eventType} for user ${userEvent.userId}`
      );

      switch (userEvent.eventType) {
        case 'USER_CREATED':
          await this.handleUserCreated(userEvent);
          break;
        case 'USER_UPDATED':
          await this.handleUserUpdated(userEvent);
          break;
        case 'USER_DELETED':
          await this.handleUserDeleted(userEvent);
          break;
        default:
          logger.warn(
            `Unknown user event type: ${(userEvent as { eventType: string }).eventType}`
          );
      }
    } catch (error) {
      logger.error('Error handling user event:', error);
      // In a production system, you might want to:
      // 1. Send to dead letter queue
      // 2. Implement retry logic
      // 3. Alert monitoring systems
    }
  }

  // Handle USER_CREATED event
  private async handleUserCreated(event: UserCreatedEvent): Promise<void> {
    try {
      // Create user profile in the materialized view
      await this.prisma.userProfile.create({
        data: {
          userId: event.data.id,
          username: event.data.username,
          displayName: event.data.displayName,
          email: event.data.email,
          avatarUrl: event.data.avatarUrl,
          isOnline: false, // Default to offline for new users
          lastSeen: null,
        },
      });

      // Invalidate conversation caches for this user
      await this.invalidateUserConversationCaches(event.data.id);

      logger.info(
        `Created user profile for user ${event.data.id} (${event.data.username})`
      );
    } catch (error) {
      // Handle duplicate key errors (user already exists)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        logger.warn(
          `User profile already exists for user ${event.data.id}, skipping creation`
        );
        return;
      }
      logger.error(
        `Failed to create user profile for user ${event.data.id}:`,
        error
      );
      throw error;
    }
  }

  // Handle USER_UPDATED event
  private async handleUserUpdated(event: UserUpdatedEvent): Promise<void> {
    try {
      // Update user profile in the materialized view
      const updateData = {
        username: event.data.username,
        displayName: event.data.displayName,
        email: event.data.email,
        avatarUrl: event.data.avatarUrl,
        isOnline: event.data.isOnline,
        lastSeen: event.data.lastSeen ? new Date(event.data.lastSeen) : null,
        updatedAt: new Date(event.data.updatedAt),
      };

      await this.prisma.userProfile.upsert({
        where: {
          userId: event.data.id,
        },
        update: updateData,
        create: {
          userId: event.data.id,
          username: event.data.username,
          displayName: event.data.displayName,
          email: event.data.email,
          avatarUrl: event.data.avatarUrl,
          isOnline: event.data.isOnline,
          lastSeen: event.data.lastSeen ? new Date(event.data.lastSeen) : null,
        },
      });

      // Invalidate conversation caches for this user (especially important for username/displayName changes)
      await this.invalidateUserConversationCaches(event.data.id);

      logger.info(
        `Updated user profile for user ${event.data.id} (${event.data.username}), changes: ${event.changes.join(', ')}`
      );
    } catch (error) {
      logger.error(
        `Failed to update user profile for user ${event.data.id}:`,
        error
      );
      throw error;
    }
  }

  // Handle USER_DELETED event
  private async handleUserDeleted(event: UserDeletedEvent): Promise<void> {
    try {
      // Soft delete or remove user profile from the materialized view
      // For now, we'll delete the profile entirely
      await this.prisma.userProfile.delete({
        where: {
          userId: event.data.id,
        },
      });

      // Invalidate conversation caches for this user
      await this.invalidateUserConversationCaches(event.data.id);

      logger.info(
        `Deleted user profile for user ${event.data.id} (${event.data.username})`
      );
    } catch (error) {
      // Handle case where user profile doesn't exist
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        logger.warn(
          `User profile not found for user ${event.data.id}, nothing to delete`
        );
        return;
      }
      logger.error(
        `Failed to delete user profile for user ${event.data.id}:`,
        error
      );
      throw error;
    }
  }

  // Invalidate conversation caches for a specific user
  private async invalidateUserConversationCaches(
    userId: number
  ): Promise<void> {
    try {
      // Find all conversations this user participates in
      const userConversations =
        await this.prisma.conversationParticipant.findMany({
          where: {
            userId,
          },
          select: {
            conversationId: true,
          },
        });

      // Invalidate cache for the user's conversation list
      const userCacheKey = `user:${userId}:conversations`;
      await redisClient.del(userCacheKey);

      // Also invalidate all other participants' conversation lists for affected conversations
      const conversationIds = userConversations.map(cp => cp.conversationId);

      if (conversationIds.length > 0) {
        // Get all participants of these conversations
        const allParticipants =
          await this.prisma.conversationParticipant.findMany({
            where: {
              conversationId: {
                in: conversationIds,
              },
            },
            select: {
              userId: true,
            },
          });

        // Get unique user IDs
        const uniqueUserIds = [...new Set(allParticipants.map(p => p.userId))];

        // Invalidate conversation caches for all affected users
        const cacheKeys = uniqueUserIds.map(id => `user:${id}:conversations`);
        if (cacheKeys.length > 0) {
          await redisClient.del(cacheKeys);
        }

        logger.info(
          `Invalidated conversation caches for ${uniqueUserIds.length} users due to user ${userId} profile change`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to invalidate conversation caches for user ${userId}:`,
        error
      );
      // Don't throw error - cache invalidation is not critical for data consistency
    }
  }

  // Get subscriber status
  getStatus(): { connected: boolean; subscribedChannels: string[] } {
    return {
      connected: this.isConnected,
      subscribedChannels: this.isConnected ? ['user_events'] : [],
    };
  }
}

export default new UserEventSubscriber();
