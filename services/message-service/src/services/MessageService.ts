import { PrismaClient, Message } from '@prisma/client';
import logger from '../utils/logger';
import { CreateMessageParams, MessageWithAttachments } from '../types';

class MessageService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async create(params: CreateMessageParams): Promise<Message> {
    const {
      conversationId,
      senderId,
      content,
      messageType = 'text',
      replyTo = null,
      attachments = [],
    } = params;

    try {
      const result = await this.prisma.$transaction(async tx => {
        // Create message
        const message = await tx.message.create({
          data: {
            conversationId,
            senderId,
            content,
            messageType,
            replyTo,
          },
        });

        // Add attachments if any
        if (attachments.length > 0) {
          await tx.messageAttachment.createMany({
            data: attachments.map(attachment => ({
              messageId: message.id,
              fileUrl: attachment.fileUrl,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
            })),
          });
        }

        // Update conversation's updated_at
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        return message;
      });

      logger.info(
        `Message created: ${result.id} in conversation ${conversationId}`
      );
      return result;
    } catch (error) {
      logger.error('Error creating message:', error);
      throw error;
    }
  }

  async getConversationMessages(
    conversationId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<MessageWithAttachments[]> {
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
        },
        include: {
          attachments: {
            select: {
              id: true,
              fileUrl: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
            },
          },
          replyToMessage: {
            select: {
              id: true,
              content: true,
              senderId: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      });

      // Transform to match the original API response format
      const transformedMessages: MessageWithAttachments[] = messages.map(
        message => ({
          id: message.id,
          conversation_id: message.conversationId,
          sender_id: message.senderId,
          content: message.content,
          message_type: message.messageType,
          reply_to: message.replyTo,
          status: message.status,
          delivered_at: message.deliveredAt,
          read_at: message.readAt,
          edited_at: message.editedAt,
          deleted_at: message.deletedAt,
          created_at: message.createdAt,
          attachments: message.attachments.map(att => ({
            id: att.id,
            fileUrl: att.fileUrl,
            fileName: att.fileName,
            fileSize: att.fileSize,
            mimeType: att.mimeType,
          })),
          reply_message: message.replyToMessage
            ? {
                id: message.replyToMessage.id,
                content: message.replyToMessage.content,
                senderId: message.replyToMessage.senderId,
                createdAt: message.replyToMessage.createdAt,
              }
            : undefined,
        })
      );

      return transformedMessages.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      throw error;
    }
  }

  async findById(id: number): Promise<MessageWithAttachments | null> {
    try {
      const message = await this.prisma.message.findFirst({
        where: {
          id,
          deletedAt: null,
        },
        include: {
          attachments: {
            select: {
              id: true,
              fileUrl: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
            },
          },
        },
      });

      if (!message) return null;

      // Transform to match the original API response format
      return {
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        content: message.content,
        message_type: message.messageType,
        reply_to: message.replyTo,
        status: message.status,
        delivered_at: message.deliveredAt,
        read_at: message.readAt,
        edited_at: message.editedAt,
        deleted_at: message.deletedAt,
        created_at: message.createdAt,
        attachments: message.attachments.map(att => ({
          id: att.id,
          fileUrl: att.fileUrl,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
        })),
      };
    } catch (error) {
      logger.error('Error finding message:', error);
      throw error;
    }
  }

  async update(id: number, content: string): Promise<Message> {
    try {
      const message = await this.prisma.message.updateMany({
        where: {
          id,
          deletedAt: null,
        },
        data: {
          content,
          editedAt: new Date(),
        },
      });

      if (message.count === 0) {
        throw new Error('Message not found or already deleted');
      }

      const updatedMessage = await this.prisma.message.findUniqueOrThrow({
        where: { id },
      });

      logger.info(`Message updated: ${id}`);
      return updatedMessage;
    } catch (error) {
      logger.error('Error updating message:', error);
      throw error;
    }
  }

  async delete(id: number): Promise<Message> {
    try {
      const message = await this.prisma.message.updateMany({
        where: {
          id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      if (message.count === 0) {
        throw new Error('Message not found or already deleted');
      }

      const deletedMessage = await this.prisma.message.findUniqueOrThrow({
        where: { id },
      });

      logger.info(`Message deleted: ${id}`);
      return deletedMessage;
    } catch (error) {
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  async searchMessages(
    userId: number,
    query: string,
    limit: number = 20
  ): Promise<
    Array<MessageWithAttachments & { conversation_name: string | null }>
  > {
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          deletedAt: null,
          content: {
            contains: query,
            mode: 'insensitive',
          },
          conversation: {
            participants: {
              some: {
                userId,
              },
            },
          },
        },
        include: {
          conversation: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      // Transform to match original format
      return messages.map(message => ({
        ...message,
        conversation_name: message.conversation.name,
      }));
    } catch (error) {
      logger.error('Error searching messages:', error);
      throw error;
    }
  }

  // Update message status to delivered
  async markAsDelivered(messageId: number): Promise<Message | null> {
    try {
      const updated = await this.prisma.message.updateMany({
        where: {
          id: messageId,
          status: 'sent',
        },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      if (updated.count > 0) {
        const message = await this.prisma.message.findUnique({
          where: { id: messageId },
        });
        logger.info(`Message marked as delivered: ${messageId}`);
        return message;
      }
      return null;
    } catch (error) {
      logger.error('Error marking message as delivered:', error);
      throw error;
    }
  }

  // Update message status to read
  async markAsRead(messageId: number): Promise<Message | null> {
    try {
      const updated = await this.prisma.message.updateMany({
        where: {
          id: messageId,
          status: { in: ['sent', 'delivered'] },
        },
        data: {
          status: 'read',
          readAt: new Date(),
        },
      });

      if (updated.count > 0) {
        const message = await this.prisma.message.findUnique({
          where: { id: messageId },
        });
        logger.info(`Message marked as read: ${messageId}`);
        return message;
      }
      return null;
    } catch (error) {
      logger.error('Error marking message as read:', error);
      throw error;
    }
  }

  // Mark all messages in conversation as delivered for a specific user
  async markConversationAsDelivered(
    conversationId: number,
    userId: number
  ): Promise<number[]> {
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: 'sent',
        },
        select: { id: true },
      });

      await this.prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: 'sent',
        },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });

      const messageIds = messages.map(m => m.id);
      logger.info(
        `Marked ${messageIds.length} messages as delivered in conversation ${conversationId} for user ${userId}`
      );
      return messageIds;
    } catch (error) {
      logger.error('Error marking conversation messages as delivered:', error);
      throw error;
    }
  }

  // Mark all messages in conversation as read for a specific user
  async markConversationAsRead(
    conversationId: number,
    userId: number
  ): Promise<number[]> {
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: { in: ['sent', 'delivered'] },
        },
        select: { id: true },
      });

      await this.prisma.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          status: { in: ['sent', 'delivered'] },
        },
        data: {
          status: 'read',
          readAt: new Date(),
        },
      });

      const messageIds = messages.map(m => m.id);
      logger.info(
        `Marked ${messageIds.length} messages as read in conversation ${conversationId} for user ${userId}`
      );
      return messageIds;
    } catch (error) {
      logger.error('Error marking conversation messages as read:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default MessageService;
