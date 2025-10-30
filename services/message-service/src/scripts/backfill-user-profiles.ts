#!/usr/bin/env npx ts-node

/**
 * User Profile Backfill Script
 *
 * This script populates the UserProfile table in message-service with existing user data
 * from the user-service. This is needed during the initial deployment of the new
 * event-driven architecture.
 *
 * Usage:
 *   npm run backfill-users
 *   or
 *   npx ts-node src/scripts/backfill-user-profiles.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../utils/logger';

interface UserFromUserService {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
}

class UserProfileBackfillService {
  private prisma: PrismaClient;
  private userServiceUrl: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.userServiceUrl =
      process.env.USER_SERVICE_URL || 'http://localhost:3001';
  }

  async run(): Promise<void> {
    try {
      logger.info('Starting user profile backfill process...');

      // Check if we have any user profiles already
      const existingProfileCount = await this.prisma.userProfile.count();

      if (existingProfileCount > 0) {
        logger.warn(
          `Found ${existingProfileCount} existing user profiles. This script will skip existing users and only add new ones.`
        );
      }

      // Get unique user IDs that are referenced in conversations
      const userIdsInConversations =
        await this.getUniqueUserIdsFromConversations();

      if (userIdsInConversations.length === 0) {
        logger.info('No user IDs found in conversations. Nothing to backfill.');
        return;
      }

      logger.info(
        `Found ${userIdsInConversations.length} unique user IDs referenced in conversations`
      );

      // Fetch user data from user-service in batches
      const batchSize = 50;
      let processedCount = 0;
      let createdCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < userIdsInConversations.length; i += batchSize) {
        const batch = userIdsInConversations.slice(i, i + batchSize);

        try {
          const users = await this.fetchUsersFromUserService(batch);

          for (const user of users) {
            try {
              // Check if profile already exists
              const existingProfile = await this.prisma.userProfile.findUnique({
                where: { userId: user.id },
              });

              if (existingProfile) {
                skippedCount++;
                logger.debug(
                  `Skipped existing user profile for user ${user.id} (${user.username})`
                );
                continue;
              }

              // Create user profile
              await this.prisma.userProfile.create({
                data: {
                  userId: user.id,
                  username: user.username,
                  displayName: user.displayName,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                  isOnline: user.isOnline,
                  lastSeen: user.lastSeen ? new Date(user.lastSeen) : null,
                },
              });

              createdCount++;
              logger.debug(
                `Created user profile for user ${user.id} (${user.username})`
              );
            } catch (profileError) {
              logger.error(
                `Failed to create profile for user ${user.id}:`,
                profileError
              );
            }
          }

          processedCount += batch.length;
          logger.info(
            `Processed ${processedCount}/${userIdsInConversations.length} users (${createdCount} created, ${skippedCount} skipped)`
          );
        } catch (batchError) {
          logger.error(
            `Failed to process batch ${i}-${i + batchSize}:`,
            batchError
          );
        }
      }

      logger.info(
        `User profile backfill completed: ${createdCount} profiles created, ${skippedCount} skipped, ${processedCount} total processed`
      );
    } catch (error) {
      logger.error('User profile backfill failed:', error);
      throw error;
    } finally {
      await this.prisma.$disconnect();
    }
  }

  private async getUniqueUserIdsFromConversations(): Promise<number[]> {
    // Get all unique user IDs from conversation participants
    const participants = await this.prisma.conversationParticipant.findMany({
      select: {
        userId: true,
      },
      distinct: ['userId'],
    });

    // Also get user IDs from message senders
    const senders = await this.prisma.message.findMany({
      select: {
        senderId: true,
      },
      distinct: ['senderId'],
    });

    // Also get user IDs from conversation creators
    const creators = await this.prisma.conversation.findMany({
      select: {
        createdBy: true,
      },
      distinct: ['createdBy'],
    });

    // Combine and deduplicate
    const allUserIds = new Set<number>();

    participants.forEach(p => allUserIds.add(p.userId));
    senders.forEach(s => allUserIds.add(s.senderId));
    creators.forEach(c => allUserIds.add(c.createdBy));

    return Array.from(allUserIds).sort((a, b) => a - b);
  }

  private async fetchUsersFromUserService(
    userIds: number[]
  ): Promise<UserFromUserService[]> {
    try {
      // This endpoint should exist in user-service for bulk user fetching
      const response = await axios.post(
        `${this.userServiceUrl}/api/users/bulk`,
        { userIds },
        {
          timeout: 30000, // 30 second timeout
        }
      );

      if (response.data && response.data.users) {
        return response.data.users;
      } else {
        logger.warn(
          `Unexpected response format from user service for batch: ${userIds.join(', ')}`
        );
        return [];
      }
    } catch (error) {
      logger.error(
        `Failed to fetch users from user service for IDs ${userIds.join(', ')}:`,
        error
      );

      // If bulk endpoint doesn't exist, we could try individual requests
      // but for now we'll just return empty array and log the error
      return [];
    }
  }
}

// Run the script if executed directly
if (require.main === module) {
  const backfillService = new UserProfileBackfillService();

  backfillService
    .run()
    .then(() => {
      logger.info('Backfill script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Backfill script failed:', error);
      process.exit(1);
    });
}

export default UserProfileBackfillService;
