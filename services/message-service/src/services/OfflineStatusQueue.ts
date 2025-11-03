import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { MessageStatus } from '../types/messageStatus';
import MessageStatusService from './MessageStatusService';

interface QueuedStatusUpdate {
  id?: number;
  messageId: number;
  conversationId: number;
  userId: number;
  status: MessageStatus;
  deviceId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  retryCount: number;
  processed: boolean;
}

interface StatusSyncRequest {
  userId: number;
  deviceId?: string;
  lastSyncTimestamp?: Date;
  statusUpdates: Array<{
    messageId: number;
    conversationId: number;
    status: MessageStatus;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }>;
}

interface StatusSyncResponse {
  success: boolean;
  processedCount: number;
  failedCount: number;
  conflicts: Array<{
    messageId: number;
    serverStatus: MessageStatus;
    clientStatus: MessageStatus;
    resolved: boolean;
  }>;
  serverUpdates: Array<{
    messageId: number;
    conversationId: number;
    status: MessageStatus;
    timestamp: Date;
  }>;
}

class OfflineStatusQueue {
  private prisma: PrismaClient;
  private statusService: MessageStatusService;
  private readonly MAX_RETRY_COUNT = 3;
  private readonly RETRY_DELAY_MS = 5000; // 5 seconds

  constructor() {
    this.prisma = new PrismaClient();
    this.statusService = new MessageStatusService();
  }

  // Queue a status update for offline processing
  async queueStatusUpdate(
    messageId: number,
    conversationId: number,
    userId: number,
    status: MessageStatus,
    deviceId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      // For now, we'll use a simple in-memory queue since we don't have the queue table yet
      // In production, this would be stored in a database table or Redis queue

      const queuedUpdate: QueuedStatusUpdate = {
        messageId,
        conversationId,
        userId,
        status,
        deviceId,
        metadata: { ...metadata, queuedAt: new Date().toISOString() },
        timestamp: new Date(),
        retryCount: 0,
        processed: false,
      };

      // Store in Redis or database queue (simplified implementation)
      logger.info(
        `Queued status update: message ${messageId}, user ${userId}, status ${status}`
      );

      // Try to process immediately
      await this.processQueuedUpdate(queuedUpdate);
    } catch (error) {
      logger.error('Error queuing status update:', error);
      throw error;
    }
  }

  // Process a queued status update
  private async processQueuedUpdate(update: QueuedStatusUpdate): Promise<void> {
    try {
      await this.statusService.createStatusEvent(
        update.messageId,
        update.conversationId,
        update.userId,
        update.status,
        update.deviceId,
        update.metadata
      );

      logger.info(
        `Processed queued status update: message ${update.messageId}, user ${update.userId}`
      );
    } catch (error) {
      logger.error(
        `Failed to process queued status update (attempt ${update.retryCount + 1}):`,
        error
      );

      if (update.retryCount < this.MAX_RETRY_COUNT) {
        // Schedule retry
        setTimeout(
          () => {
            update.retryCount++;
            this.processQueuedUpdate(update);
          },
          this.RETRY_DELAY_MS * Math.pow(2, update.retryCount)
        ); // Exponential backoff
      } else {
        logger.error(
          `Max retries reached for status update: message ${update.messageId}, user ${update.userId}`
        );
      }
    }
  }

  // Synchronize status updates from client (for offline reconciliation)
  async syncStatusUpdates(
    syncRequest: StatusSyncRequest
  ): Promise<StatusSyncResponse> {
    const response: StatusSyncResponse = {
      success: false,
      processedCount: 0,
      failedCount: 0,
      conflicts: [],
      serverUpdates: [],
    };

    try {
      logger.info(
        `Starting status sync for user ${syncRequest.userId}, ${syncRequest.statusUpdates.length} updates`
      );

      // Process each status update from client
      for (const update of syncRequest.statusUpdates) {
        try {
          // Check if this update conflicts with server state
          const serverMessage = await this.prisma.message.findUnique({
            where: { id: update.messageId },
            select: {
              status: true,
              conversationId: true,
              createdAt: true,
            },
          });

          if (!serverMessage) {
            logger.warn(`Message ${update.messageId} not found during sync`);
            response.failedCount++;
            continue;
          }

          const serverStatus = serverMessage.status as MessageStatus;
          const clientStatus = update.status;

          // Check for conflicts (server message is newer than client update)
          if (
            serverMessage.createdAt > update.timestamp &&
            serverStatus !== clientStatus
          ) {
            response.conflicts.push({
              messageId: update.messageId,
              serverStatus,
              clientStatus,
              resolved: false, // Client should handle resolution
            });
            continue;
          }

          // Apply client update if it's newer or same timestamp
          await this.statusService.createStatusEvent(
            update.messageId,
            update.conversationId,
            syncRequest.userId,
            update.status,
            syncRequest.deviceId,
            {
              ...update.metadata,
              syncedAt: new Date().toISOString(),
              originalTimestamp: update.timestamp.toISOString(),
            }
          );

          response.processedCount++;
        } catch (error) {
          logger.error(
            `Error processing sync update for message ${update.messageId}:`,
            error
          );
          response.failedCount++;
        }
      }

      // Get server updates that happened after client's last sync
      if (syncRequest.lastSyncTimestamp) {
        const serverUpdates = await this.getServerUpdatesAfter(
          syncRequest.userId,
          syncRequest.lastSyncTimestamp
        );
        response.serverUpdates = serverUpdates;
      }

      response.success = response.failedCount === 0;

      logger.info(
        `Status sync completed for user ${syncRequest.userId}: ${response.processedCount} processed, ${response.failedCount} failed, ${response.conflicts.length} conflicts`
      );

      return response;
    } catch (error) {
      logger.error('Error during status sync:', error);
      response.success = false;
      throw error;
    }
  }

  // Get server status updates that happened after a specific timestamp
  private async getServerUpdatesAfter(
    userId: number,
    timestamp: Date
  ): Promise<
    Array<{
      messageId: number;
      conversationId: number;
      status: MessageStatus;
      timestamp: Date;
    }>
  > {
    try {
      // Get status events that this user should know about
      const events = await this.prisma.messageStatusEvent.findMany({
        where: {
          timestamp: { gt: timestamp },
          // Get events for messages in conversations where this user is a participant
          message: {
            conversation: {
              participants: {
                some: { userId },
              },
            },
          },
        },
        select: {
          messageId: true,
          conversationId: true,
          status: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'asc' },
        take: 100, // Limit to prevent huge responses
      });

      return events.map(event => ({
        messageId: event.messageId,
        conversationId: event.conversationId,
        status: event.status as MessageStatus,
        timestamp: event.timestamp,
      }));
    } catch (error) {
      logger.error('Error getting server updates:', error);
      return [];
    }
  }

  // Clean up old queue entries (maintenance function)
  async cleanupOldQueueEntries(olderThanHours: number = 24): Promise<void> {
    // This would clean up old queue entries from database/Redis
    // For now, just log
    logger.info(
      `Cleanup: would remove queue entries older than ${olderThanHours} hours`
    );
  }

  // Get queue status for monitoring
  async getQueueStatus(): Promise<{
    pendingCount: number;
    failedCount: number;
    totalProcessed: number;
  }> {
    // This would return actual queue statistics
    // For now, return dummy data
    return {
      pendingCount: 0,
      failedCount: 0,
      totalProcessed: 0,
    };
  }
}

export default OfflineStatusQueue;
export { StatusSyncRequest, StatusSyncResponse, QueuedStatusUpdate };
