import { Router, Request, Response, NextFunction } from 'express';
import MessageService from '../services/MessageService';
import ConversationService from '../services/ConversationService';
import { verifyToken } from '../middleware/auth';
import { invalidateConversationCache, publishMessage } from '../utils/redis';
import logger from '../utils/logger';
import { CreateMessageRequest, MessageListQuery, ApiResponse } from '../types';

const router = Router();
const messageService = new MessageService();
const conversationService = new ConversationService();

// Get messages for a conversation
router.get(
  '/conversations/:conversationId',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const { limit = 50, offset = 0 } = req.query as MessageListQuery;
      const userId = req.user.id;

      // Check if user is participant
      const isParticipant = await conversationService.isParticipant(
        parseInt(conversationId),
        userId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const messages = await messageService.getConversationMessages(
        parseInt(conversationId),
        typeof limit === 'string' ? parseInt(limit) : limit || 50,
        typeof offset === 'string' ? parseInt(offset) : offset || 0
      );

      // NOTE: Removed automatic delivery marking from here - delivery now happens
      // when messages are received via socket, not when they're fetched

      res.json({ messages });
    } catch (error) {
      next(error);
    }
  }
);

// Send a new message
router.post(
  '/',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        conversationId,
        content,
        messageType = 'text',
        replyTo,
        attachments = [],
      } = req.body as CreateMessageRequest;
      const senderId = req.user.id;

      // Validation
      if (!conversationId || !content) {
        res
          .status(400)
          .json({ error: 'Conversation ID and content are required' });
        return;
      }

      if (content.trim().length === 0) {
        res.status(400).json({ error: 'Message content cannot be empty' });
        return;
      }

      if (content.length > 4000) {
        res.status(400).json({ error: 'Message content too long' });
        return;
      }

      // Check if user is participant
      const isParticipant = await conversationService.isParticipant(
        conversationId,
        senderId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Validate reply message if specified
      if (replyTo) {
        const replyMessage = await messageService.findById(replyTo);
        if (!replyMessage || replyMessage.conversation_id !== conversationId) {
          res.status(400).json({ error: 'Invalid reply message' });
          return;
        }
      }

      const message = await messageService.create({
        conversationId,
        senderId,
        content: content.trim(),
        messageType,
        replyTo,
        attachments,
      });

      // Invalidate cache
      await invalidateConversationCache(conversationId);

      logger.info(
        `Message sent by user ${senderId} in conversation ${conversationId}`
      );

      // Get the complete message with attachments
      const completeMessage = await messageService.findById(message.id);

      // Publish message event for real-time service
      await publishMessage('new_message', completeMessage);

      res.status(201).json({
        message: 'Message sent successfully',
        data: completeMessage,
      } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

// Edit a message
router.patch(
  '/:id',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      if (!content || content.trim().length === 0) {
        res.status(400).json({ error: 'Message content cannot be empty' });
        return;
      }

      if (content.length > 4000) {
        res.status(400).json({ error: 'Message content too long' });
        return;
      }

      // Get original message
      const originalMessage = await messageService.findById(parseInt(id));
      if (!originalMessage) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Check if user is the sender
      if (originalMessage.sender_id !== userId) {
        res.status(403).json({ error: 'Can only edit your own messages' });
        return;
      }

      // Check if message is not too old (e.g., 24 hours)
      const messageAge =
        Date.now() - new Date(originalMessage.created_at).getTime();
      const maxEditAge = 24 * 60 * 60 * 1000; // 24 hours

      if (messageAge > maxEditAge) {
        res.status(400).json({ error: 'Message too old to edit' });
        return;
      }

      const updatedMessage = await messageService.update(
        parseInt(id),
        content.trim()
      );

      // Invalidate cache
      await invalidateConversationCache(originalMessage.conversation_id);

      logger.info(`Message ${id} edited by user ${userId}`);

      res.json({
        message: 'Message updated successfully',
        data: updatedMessage,
      } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

// Delete a message
router.delete(
  '/:id',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get original message
      const originalMessage = await messageService.findById(parseInt(id));
      if (!originalMessage) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Check if user is the sender
      if (originalMessage.sender_id !== userId) {
        res.status(403).json({ error: 'Can only delete your own messages' });
        return;
      }

      await messageService.delete(parseInt(id));

      // Invalidate cache
      await invalidateConversationCache(originalMessage.conversation_id);

      logger.info(`Message ${id} deleted by user ${userId}`);

      res.json({ message: 'Message deleted successfully' } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

// Search messages
router.get(
  '/search',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q: query, limit = '20' } = req.query as {
        q?: string;
        limit?: string;
      };
      const userId = req.user.id;

      if (!query || query.trim().length < 2) {
        res
          .status(400)
          .json({ error: 'Search query must be at least 2 characters' });
        return;
      }

      const messages = await messageService.searchMessages(
        userId,
        query.trim(),
        parseInt(limit)
      );

      res.json({ messages });
    } catch (error) {
      next(error);
    }
  }
);

// Mark message as delivered
router.patch(
  '/:id/delivered',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get the message to check if user is a participant
      const message = await messageService.findById(parseInt(id));
      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Check if user is participant in the conversation
      const isParticipant = await conversationService.isParticipant(
        message.conversation_id,
        userId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Don't mark own messages as delivered
      if (message.sender_id === userId) {
        res.status(400).json({ error: 'Cannot mark own message as delivered' });
        return;
      }

      const updatedMessage = await messageService.markAsDelivered(parseInt(id));

      if (updatedMessage) {
        logger.info(`Message ${id} marked as delivered by user ${userId}`);

        // Publish delivery status update for real-time service
        await publishMessage('message_delivered', {
          messageId: parseInt(id),
          conversationId: message.conversation_id,
          userId: userId,
          deliveredAt: updatedMessage.deliveredAt,
        });

        res.json({
          message: 'Message marked as delivered',
          data: {
            messageId: parseInt(id),
            status: 'delivered',
            deliveredAt: updatedMessage.deliveredAt,
          },
        } as ApiResponse);
      } else {
        res
          .status(400)
          .json({ error: 'Message already delivered or invalid status' });
      }
    } catch (error) {
      next(error);
    }
  }
);

// Mark message as read
router.patch(
  '/:id/read',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get the message to check if user is a participant
      const message = await messageService.findById(parseInt(id));
      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Check if user is participant in the conversation
      const isParticipant = await conversationService.isParticipant(
        message.conversation_id,
        userId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Don't mark own messages as read
      if (message.sender_id === userId) {
        res.status(400).json({ error: 'Cannot mark own message as read' });
        return;
      }

      const updatedMessage = await messageService.markAsRead(parseInt(id));

      if (updatedMessage) {
        logger.info(`Message ${id} marked as read by user ${userId}`);

        // Publish read status update for real-time service
        await publishMessage('message_read', {
          messageId: parseInt(id),
          conversationId: message.conversation_id,
          userId: userId,
          readAt: updatedMessage.readAt,
        });

        res.json({
          message: 'Message marked as read',
          data: {
            messageId: parseInt(id),
            status: 'read',
            readAt: updatedMessage.readAt,
          },
        } as ApiResponse);
      } else {
        res
          .status(400)
          .json({ error: 'Message already read or invalid status' });
      }
    } catch (error) {
      next(error);
    }
  }
);

// Mark all messages in conversation as read
router.patch(
  '/conversations/:conversationId/read',
  verifyToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;

      // Check if user is participant
      const isParticipant = await conversationService.isParticipant(
        parseInt(conversationId),
        userId
      );
      if (!isParticipant) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const messageIds = await messageService.markConversationAsRead(
        parseInt(conversationId),
        userId
      );

      logger.info(
        `${messageIds.length} messages marked as read in conversation ${conversationId} by user ${userId}`
      );

      // Publish read status update for real-time service
      if (messageIds.length > 0) {
        await publishMessage('conversation_read', {
          conversationId: parseInt(conversationId),
          userId: userId,
          messageIds: messageIds,
          readAt: new Date().toISOString(),
        });
      }

      res.json({
        message: 'Messages marked as read',
        data: {
          conversationId: parseInt(conversationId),
          markedCount: messageIds.length,
        },
      } as ApiResponse);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
