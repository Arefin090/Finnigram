import { Router, Request, Response, NextFunction } from 'express';
import ConversationService from '../services/ConversationService';
import { verifyToken } from '../middleware/auth';
import {
  publishMessage,
  getCachedUserConversations,
  cacheUserConversations,
} from '../utils/redis';
import logger from '../utils/logger';
import { CreateConversationRequest, ApiResponse } from '../types';

const router = Router();
const conversationService = new ConversationService();

// Get user's conversations
router.get(
  '/',
  verifyToken,
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    try {
      const userId = req.user.id;

      // Check cache first for instant loading
      const cachedConversations = await getCachedUserConversations(userId);
      if (cachedConversations) {
        const responseTime = Date.now() - startTime;
        logger.info(
          `[PERF] Cached conversations returned for user ${userId} in ${responseTime}ms (${cachedConversations.length} conversations)`
        );
        res.json({ conversations: cachedConversations });
        return;
      }

      // Use the optimized ConversationService method (already handles N+1 query problem)
      const conversationsWithParticipants =
        await conversationService.getConversationsWithParticipants(userId);

      // Cache the results for future requests
      await cacheUserConversations(userId, conversationsWithParticipants);

      const responseTime = Date.now() - startTime;
      logger.info(
        `[PERF] Database query completed for user ${userId} in ${responseTime}ms (${conversationsWithParticipants.length} conversations, cached for future)`
      );
      res.json({ conversations: conversationsWithParticipants });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(
        `[PERF] Conversations query failed for user ${req.user?.id || 'unknown'} after ${responseTime}ms:`,
        error
      );
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
          // Return the existing conversation (participants will be empty as per ConversationService design)
          res.json({ conversation: existingConversation });
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

      // Note: participants array will be empty as per ConversationService design
      // Frontend should handle fetching user details separately if needed
      const conversationWithParticipants = conversation;

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
