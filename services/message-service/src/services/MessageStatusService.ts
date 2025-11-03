import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import {
  MessageStatus,
  MessageStatusEvent,
  MessageStatusStateMachine,
  MessageStatusUtils,
} from '../types/messageStatus';

class MessageStatusService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Create a new status event with validation
  async createStatusEvent(
    messageId: number,
    conversationId: number,
    userId: number,
    newStatus: MessageStatus,
    deviceId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      // Get current message status
      const currentMessage = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { status: true, senderId: true, conversationId: true },
      });

      if (!currentMessage) {
        throw new Error(`Message ${messageId} not found`);
      }

      if (currentMessage.conversationId !== conversationId) {
        throw new Error(
          `Message ${messageId} does not belong to conversation ${conversationId}`
        );
      }

      const currentStatus = currentMessage.status as MessageStatus;

      // Validate status transition
      if (currentStatus !== newStatus) {
        try {
          MessageStatusStateMachine.validateTransition(
            currentStatus,
            newStatus
          );
        } catch (error) {
          logger.warn(
            `Invalid status transition for message ${messageId}: ${currentStatus} -> ${newStatus}. Error: ${error}`
          );
          // For now, log the warning but allow the transition (for backward compatibility)
          // In production, you might want to throw the error
        }
      }

      // Create status event record
      const statusEventData = MessageStatusUtils.createStatusEvent(
        messageId,
        conversationId,
        userId,
        newStatus,
        currentStatus,
        deviceId,
        metadata
      );

      await this.prisma.messageStatusEvent.create({
        data: {
          messageId: statusEventData.messageId,
          conversationId: statusEventData.conversationId,
          userId: statusEventData.userId,
          status: statusEventData.status,
          previousStatus: statusEventData.previousStatus,
          timestamp: statusEventData.timestamp,
          deviceId: statusEventData.deviceId,
          metadata: statusEventData.metadata
            ? JSON.parse(JSON.stringify(statusEventData.metadata))
            : null,
        },
      });

      // Update message status
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: newStatus,
          ...(newStatus === MessageStatus.DELIVERED && {
            deliveredAt: new Date(),
          }),
          ...(newStatus === MessageStatus.READ && { readAt: new Date() }),
        },
      });

      logger.info(
        `Status event created: message ${messageId}, user ${userId}, ${currentStatus} -> ${newStatus}`
      );
    } catch (error) {
      logger.error('Error creating status event:', error);
      throw error;
    }
  }

  // Get status events for a message
  async getMessageStatusEvents(
    messageId: number
  ): Promise<MessageStatusEvent[]> {
    try {
      const events = await this.prisma.messageStatusEvent.findMany({
        where: { messageId },
        orderBy: { timestamp: 'desc' },
      });

      return events.map(event => ({
        id: event.id,
        messageId: event.messageId,
        conversationId: event.conversationId,
        userId: event.userId,
        status: event.status as MessageStatus,
        previousStatus: event.previousStatus as MessageStatus | undefined,
        timestamp: event.timestamp,
        deviceId: event.deviceId || undefined,
        metadata: (event.metadata as Record<string, unknown>) || undefined,
      }));
    } catch (error) {
      logger.error('Error getting message status events:', error);
      throw error;
    }
  }

  // Get status events for a conversation
  async getConversationStatusEvents(
    conversationId: number,
    limit: number = 100
  ): Promise<MessageStatusEvent[]> {
    try {
      const events = await this.prisma.messageStatusEvent.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return events.map(event => ({
        id: event.id,
        messageId: event.messageId,
        conversationId: event.conversationId,
        userId: event.userId,
        status: event.status as MessageStatus,
        previousStatus: event.previousStatus as MessageStatus | undefined,
        timestamp: event.timestamp,
        deviceId: event.deviceId || undefined,
        metadata: (event.metadata as Record<string, unknown>) || undefined,
      }));
    } catch (error) {
      logger.error('Error getting conversation status events:', error);
      throw error;
    }
  }

  // Mark message as delivered automatically when received
  async markAsDelivered(
    messageId: number,
    conversationId: number,
    userId: number,
    deviceId?: string
  ): Promise<void> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, status: true },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Don't mark own messages as delivered
      if (message.senderId === userId) {
        return;
      }

      // Only mark as delivered if currently 'sent'
      if (message.status === MessageStatus.SENT) {
        await this.createStatusEvent(
          messageId,
          conversationId,
          userId,
          MessageStatus.DELIVERED,
          deviceId,
          { autoDelivered: true }
        );
      }
    } catch (error) {
      logger.error('Error marking message as delivered:', error);
      throw error;
    }
  }

  // Mark message as read
  async markAsRead(
    messageId: number,
    conversationId: number,
    userId: number,
    deviceId?: string
  ): Promise<void> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, status: true },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Don't mark own messages as read
      if (message.senderId === userId) {
        return;
      }

      // Can mark as read from delivered or sent status
      const currentStatus = message.status as MessageStatus;
      if (
        currentStatus === MessageStatus.DELIVERED ||
        currentStatus === MessageStatus.SENT
      ) {
        await this.createStatusEvent(
          messageId,
          conversationId,
          userId,
          MessageStatus.READ,
          deviceId
        );
      }
    } catch (error) {
      logger.error('Error marking message as read:', error);
      throw error;
    }
  }

  // Get conversation-level status for user's messages
  async getConversationStatusForUser(
    conversationId: number,
    userId: number
  ): Promise<MessageStatus | null> {
    try {
      // Get user's messages in this conversation
      const userMessages = await this.prisma.message.findMany({
        where: {
          conversationId,
          senderId: userId,
          deletedAt: null,
        },
        select: {
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10, // Check last 10 messages for status
      });

      if (userMessages.length === 0) {
        return null;
      }

      const messagesWithStatus = userMessages.map(msg => ({
        status: msg.status as MessageStatus,
        createdAt: msg.createdAt,
      }));

      return MessageStatusUtils.determineConversationStatus(messagesWithStatus);
    } catch (error) {
      logger.error('Error getting conversation status for user:', error);
      throw error;
    }
  }

  // Cleanup old status events (for maintenance)
  async cleanupOldStatusEvents(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.messageStatusEvent.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(
        `Cleaned up ${result.count} old status events older than ${olderThanDays} days`
      );
      return result.count;
    } catch (error) {
      logger.error('Error cleaning up old status events:', error);
      throw error;
    }
  }
}

export default MessageStatusService;
