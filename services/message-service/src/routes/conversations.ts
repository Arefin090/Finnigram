import { Router, Request, Response, NextFunction } from 'express';
import ConversationService from '../services/ConversationService';
import { verifyToken } from '../middleware/auth';
import { publishMessage } from '../utils/redis';
import logger from '../utils/logger';
import { CreateConversationRequest, ApiResponse, User } from '../types';
import { PrismaClient } from '@prisma/client';

const router = Router();
const conversationService = new ConversationService();
const prisma = new PrismaClient();

// Get user's conversations
router.get(
  '/',
  verifyToken,
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = req.user.id;

      // Get conversations with participant data - matching original complex query
      const conversationsResult = await prisma.$queryRaw<
        Array<{
          id: number;
          name: string;
          type: string;
          description: string;
          created_at: Date;
          updated_at: Date;
          last_read_at: Date | null;
        }>
      >`
      SELECT c.*, cp.last_read_at
      FROM conversations c
      JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = ${userId}
      ORDER BY c.created_at DESC
    `;

      // For each conversation, get participant details and latest message
      const conversationsWithParticipants = await Promise.all(
        conversationsResult.map(async conversation => {
          const participantsResult = await prisma.$queryRaw<User[]>`
          SELECT u.id as user_id, u.username, u.display_name, u.email
          FROM users u
          JOIN conversation_participants cp ON u.id = cp.user_id
          WHERE cp.conversation_id = ${conversation.id}
        `;

          // Get the latest message for preview
          const latestMessageResult = await prisma.$queryRaw<
            Array<{
              content: string;
              created_at: Date;
            }>
          >`
          SELECT content, created_at
          FROM messages
          WHERE conversation_id = ${conversation.id}
          ORDER BY created_at DESC
          LIMIT 1
        `;

          const latestMessage = latestMessageResult[0];

          return {
            ...conversation,
            participants: participantsResult,
            last_message: latestMessage?.content || null,
            last_message_at:
              latestMessage?.created_at || conversation.created_at,
          };
        })
      );

      // Sort conversations by last message time (most recent first)
      conversationsWithParticipants.sort(
        (a, b) =>
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime()
      );

      logger.info(
        `Fetched ${conversationsWithParticipants.length} conversations for user ${userId}`
      );
      res.json({ conversations: conversationsWithParticipants });
    } catch (error) {
      logger.error('Error in GET /conversations:', error);
      res
        .status(500)
        .json({ error: 'Database error', details: (error as Error).message });
    }
  }
);

// Create new conversation
router.post(
  '/',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        type,
        name,
        description,
        participants = [],
      } = req.body as CreateConversationRequest;
      const createdBy = req.user.id;

      // Validation
      if (type === 'group' && !name) {
        res.status(400).json({ error: 'Group conversations require a name' });
        return;
      }

      if (type === 'direct' && participants.length !== 1) {
        res.status(400).json({
          error: 'Direct conversations require exactly one other participant',
        });
        return;
      }

      // Check if direct conversation already exists
      if (type === 'direct') {
        const existingConversation =
          await conversationService.findExistingDirectConversation(
            createdBy,
            participants[0]
          );
        if (existingConversation) {
          // Get the existing conversation with participant data
          const participantsResult = await prisma.$queryRaw<User[]>`
          SELECT u.id as user_id, u.username, u.display_name, u.email
          FROM users u
          JOIN conversation_participants cp ON u.id = cp.user_id
          WHERE cp.conversation_id = ${existingConversation.id}
        `;

          const conversationWithParticipants = {
            ...existingConversation,
            participants: participantsResult,
          };

          res.json({ conversation: conversationWithParticipants });
          return;
        }
      }

      const conversation = await conversationService.create({
        type,
        name,
        description,
        createdBy,
        participants: [...participants, createdBy],
      });

      // Get the conversation with participant data for real-time sync
      const participantsResult = await prisma.$queryRaw<User[]>`
      SELECT u.id as user_id, u.username, u.display_name, u.email
      FROM users u
      JOIN conversation_participants cp ON u.id = cp.user_id
      WHERE cp.conversation_id = ${conversation.id}
    `;

      const conversationWithParticipants = {
        ...conversation,
        participants: participantsResult,
      };

      // Broadcast to all participants via Redis
      try {
        const allParticipants = [...participants, createdBy];

        for (const participantId of allParticipants) {
          await publishMessage('conversation_created', {
            userId: participantId,
            conversation: conversationWithParticipants,
          });
        }
        logger.info(
          `Broadcasted conversation ${conversation.id} to ${allParticipants.length} participants`
        );
      } catch (redisError) {
        logger.error('Failed to broadcast conversation creation:', redisError);
        // Don't fail the request if Redis broadcast fails
      }

      logger.info(
        `Conversation created by user ${createdBy}: ${conversation.id}`
      );

      res.status(201).json({
        message: 'Conversation created successfully',
        conversation: conversationWithParticipants,
      } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

// Get conversation details
router.get(
  '/:id',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if user is participant
      const isParticipant = await conversationService.isParticipant(
        parseInt(id),
        userId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const conversation = await conversationService.findById(parseInt(id));
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const participants = await conversationService.getParticipants(
        parseInt(id)
      );

      res.json({
        conversation: {
          ...conversation,
          participants,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Add participant to conversation
router.post(
  '/:id/participants',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { userId: newUserId } = req.body;
      const currentUserId = req.user.id;

      // Check if current user is participant and has permission
      const isParticipant = await conversationService.isParticipant(
        parseInt(id),
        currentUserId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if conversation exists and is a group
      const conversation = await conversationService.findById(parseInt(id));
      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.type === 'direct') {
        res
          .status(400)
          .json({ error: 'Cannot add participants to direct conversations' });
        return;
      }

      await conversationService.addParticipant(parseInt(id), newUserId);

      logger.info(
        `User ${newUserId} added to conversation ${id} by ${currentUserId}`
      );

      res.json({ message: 'Participant added successfully' } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

// Remove participant from conversation
router.delete(
  '/:id/participants/:userId',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, userId: targetUserId } = req.params;
      const currentUserId = req.user.id;

      // Check if current user is participant
      const isParticipant = await conversationService.isParticipant(
        parseInt(id),
        currentUserId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Users can remove themselves, or admins can remove others
      if (currentUserId !== parseInt(targetUserId)) {
        // Check if current user is admin (simplified - in real app, check role)
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }

      await conversationService.removeParticipant(
        parseInt(id),
        parseInt(targetUserId)
      );

      logger.info(`User ${targetUserId} removed from conversation ${id}`);

      res.json({ message: 'Participant removed successfully' } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

// Mark conversation as read
router.patch(
  '/:id/read',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if user is participant
      const isParticipant = await conversationService.isParticipant(
        parseInt(id),
        userId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      await conversationService.updateLastRead(parseInt(id), userId);

      res.json({ message: 'Conversation marked as read' } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
