import { PrismaClient, Conversation } from '@prisma/client';
import logger from '../utils/logger';
import {
  CreateConversationParams,
  ConversationParticipant,
  ConversationWithParticipants,
} from '../types';

class ConversationService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async create(params: CreateConversationParams): Promise<Conversation> {
    const {
      type = 'direct',
      name,
      description,
      createdBy,
      participants = [],
    } = params;

    try {
      const result = await this.prisma.$transaction(async tx => {
        // Create conversation
        const conversation = await tx.conversation.create({
          data: {
            type,
            name,
            description,
            createdBy,
          },
        });

        // Add creator as admin
        await tx.conversationParticipant.create({
          data: {
            conversationId: conversation.id,
            userId: createdBy,
            role: 'admin',
          },
        });

        // Add other participants
        for (const userId of participants) {
          if (userId !== createdBy) {
            await tx.conversationParticipant.create({
              data: {
                conversationId: conversation.id,
                userId,
                role: 'member',
              },
            });
          }
        }

        return conversation;
      });

      logger.info(`Conversation created: ${result.id}`);
      return result;
    } catch (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    }
  }

  async findById(id: number): Promise<Conversation | null> {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id },
      });
      return conversation;
    } catch (error) {
      logger.error('Error finding conversation:', error);
      throw error;
    }
  }

  async getUserConversations(userId: number): Promise<
    Array<{
      id: number;
      type: string;
      name: string | null;
      description: string | null;
      avatar_url: string | null;
      created_by: number;
      created_at: Date;
      updated_at: Date;
      last_read_at: Date | null;
      unread_count: bigint;
      last_message_content: string | null;
      last_message_created_at: Date | null;
    }>
  > {
    try {
      // This is a complex query that matches the original implementation
      // We need to get conversations with unread counts and last message info
      const conversations = await this.prisma.$queryRaw<
        Array<{
          id: number;
          type: string;
          name: string | null;
          description: string | null;
          avatar_url: string | null;
          created_by: number;
          created_at: Date;
          updated_at: Date;
          last_read_at: Date | null;
          unread_count: bigint;
          last_message_content: string | null;
          last_message_created_at: Date | null;
        }>
      >`
        SELECT 
          c.*,
          cp.last_read_at,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count,
          (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
          (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
        FROM conversations c
        JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.user_id = ${userId}
        ORDER BY COALESCE(last_message_at, c.created_at) DESC
      `;

      return conversations;
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw error;
    }
  }

  async getParticipants(
    conversationId: number
  ): Promise<ConversationParticipant[]> {
    try {
      const participants = await this.prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          lastReadAt: true,
        },
      });

      // Transform to match original format
      return participants.map(p => ({
        user_id: p.userId,
        role: p.role,
        joined_at: p.joinedAt,
        last_read_at: p.lastReadAt,
      }));
    } catch (error) {
      logger.error('Error getting conversation participants:', error);
      throw error;
    }
  }

  // New method to get participants with user details from local profiles
  async getParticipantsWithUserDetails(conversationId: number): Promise<
    Array<
      ConversationParticipant & {
        user: {
          id: number;
          username: string;
          display_name: string | null;
          email: string;
        };
      }
    >
  > {
    try {
      const participants = await this.prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          lastReadAt: true,
        },
      });

      // Get user profiles for all participants from local materialized view
      const participantUserIds = participants.map(p => p.userId);
      const userProfiles = await this.prisma.userProfile.findMany({
        where: {
          userId: {
            in: participantUserIds,
          },
        },
        select: {
          userId: true,
          username: true,
          displayName: true,
          email: true,
        },
      });

      // Combine participant data with user profile data
      return participants.map(p => {
        const userProfile = userProfiles.find(
          profile => profile.userId === p.userId
        );
        return {
          user_id: p.userId,
          role: p.role,
          joined_at: p.joinedAt,
          last_read_at: p.lastReadAt,
          user: {
            id: p.userId,
            username: userProfile?.username || 'Unknown',
            display_name: userProfile?.displayName || null,
            email: userProfile?.email || 'unknown@email.com',
          },
        };
      });
    } catch (error) {
      logger.error(
        'Error getting conversation participants with user details:',
        error
      );
      throw error;
    }
  }

  async addParticipant(
    conversationId: number,
    userId: number,
    role: string = 'member'
  ): Promise<void> {
    try {
      await this.prisma.conversationParticipant.upsert({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        update: {},
        create: {
          conversationId,
          userId,
          role,
        },
      });

      logger.info(`User ${userId} added to conversation ${conversationId}`);
    } catch (error) {
      logger.error('Error adding participant:', error);
      throw error;
    }
  }

  async removeParticipant(
    conversationId: number,
    userId: number
  ): Promise<void> {
    try {
      await this.prisma.conversationParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      logger.info(`User ${userId} removed from conversation ${conversationId}`);
    } catch (error) {
      logger.error('Error removing participant:', error);
      throw error;
    }
  }

  async updateLastRead(conversationId: number, userId: number): Promise<void> {
    try {
      await this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error updating last read:', error);
      throw error;
    }
  }

  async isParticipant(
    conversationId: number,
    userId: number
  ): Promise<boolean> {
    try {
      const participant = await this.prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });
      return participant !== null;
    } catch (error) {
      logger.error('Error checking participant:', error);
      throw error;
    }
  }

  // Helper method for checking existing direct conversation (used in routes)
  async findExistingDirectConversation(
    user1Id: number,
    user2Id: number
  ): Promise<Conversation | null> {
    try {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          type: 'direct',
          participants: {
            every: {
              userId: { in: [user1Id, user2Id] },
            },
          },
        },
        include: {
          participants: {
            where: {
              userId: { in: [user1Id, user2Id] },
            },
          },
        },
      });

      // Ensure we have exactly 2 participants and they match our users
      if (conversation && conversation.participants.length === 2) {
        const participantIds = conversation.participants
          .map(p => p.userId)
          .sort();
        const userIds = [user1Id, user2Id].sort();

        if (
          participantIds[0] === userIds[0] &&
          participantIds[1] === userIds[1]
        ) {
          return conversation;
        }
      }

      return null;
    } catch (error) {
      logger.error('Error checking existing direct conversation:', error);
      return null;
    }
  }

  // Method to get conversations with participant details (used in routes)
  async getConversationsWithParticipants(
    userId: number
  ): Promise<ConversationWithParticipants[]> {
    try {
      const conversations = await this.prisma.conversation.findMany({
        where: {
          participants: {
            some: {
              userId,
            },
          },
        },
        include: {
          participants: {
            select: {
              userId: true,
              lastReadAt: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Now we use the local user profiles instead of cross-service calls
      const result: ConversationWithParticipants[] = [];

      for (const conversation of conversations) {
        // Get the latest message for preview (exclude deleted messages)
        const latestMessage = await this.prisma.message.findFirst({
          where: {
            conversationId: conversation.id,
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            content: true,
            createdAt: true,
          },
        });

        // Get user profiles for all participants from local materialized view
        const participantUserIds = conversation.participants.map(p => p.userId);
        const userProfiles = await this.prisma.userProfile.findMany({
          where: {
            userId: {
              in: participantUserIds,
            },
          },
          select: {
            userId: true,
            username: true,
            displayName: true,
            email: true,
          },
        });

        // Create user objects in the expected format
        const participants = userProfiles.map(profile => ({
          id: profile.userId,
          username: profile.username,
          display_name: profile.displayName || undefined,
          email: profile.email,
        }));

        const userParticipant = conversation.participants.find(
          p => p.userId === userId
        );

        // Calculate unread count for this user
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            deletedAt: null,
            senderId: { not: userId }, // Don't count own messages
            createdAt: {
              gt: userParticipant?.lastReadAt || new Date(0), // Messages after last read
            },
          },
        });

        result.push({
          id: conversation.id,
          type: conversation.type,
          name: conversation.name,
          description: conversation.description,
          avatar_url: conversation.avatarUrl,
          created_by: conversation.createdBy,
          created_at: conversation.createdAt,
          updated_at: conversation.updatedAt,
          participants, // Now populated with actual user data from local profiles
          last_message: latestMessage?.content || null,
          last_message_at: latestMessage?.createdAt || conversation.createdAt,
          last_read_at: userParticipant?.lastReadAt || null,
          unread_count: unreadCount,
        });
      }

      // Sort by last message time (most recent first)
      result.sort(
        (a, b) =>
          new Date(b.last_message_at || 0).getTime() -
          new Date(a.last_message_at || 0).getTime()
      );

      return result;
    } catch (error) {
      logger.error('Error getting conversations with participants:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default ConversationService;
