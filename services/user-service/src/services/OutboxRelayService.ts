import { prisma } from '../utils/database';
import { publishUserEvent } from '../utils/redis';
import logger from '../utils/logger';
import { UserEvent } from '../types';

class OutboxRelayService {
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly PROCESSING_INTERVAL = 1000; // 1 second
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 2000; // 2 seconds

  // Start the outbox relay process
  start(): void {
    if (this.intervalId) {
      logger.warn('Outbox relay service is already running');
      return;
    }

    logger.info('Starting outbox relay service...');
    this.intervalId = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processOutboxEvents();
      }
    }, this.PROCESSING_INTERVAL);

    logger.info('Outbox relay service started');
  }

  // Stop the outbox relay process
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Outbox relay service stopped');
    }
  }

  // Process unprocessed events from the outbox
  private async processOutboxEvents(): Promise<void> {
    this.isProcessing = true;

    try {
      // Fetch unprocessed events in batches, ordered by creation time
      const unprocessedEvents = await prisma.userEventOutbox.findMany({
        where: {
          processed: false,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: this.BATCH_SIZE,
      });

      if (unprocessedEvents.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.info(`Processing ${unprocessedEvents.length} outbox events...`);

      // Process each event with retry logic
      for (const outboxEvent of unprocessedEvents) {
        const success = await this.processEventWithRetry(outboxEvent);
        if (!success) {
          logger.error(
            `Failed to process outbox event ${outboxEvent.id} after ${this.MAX_RETRY_ATTEMPTS} attempts`
          );
        }
      }

      logger.info(
        `Completed processing ${unprocessedEvents.length} outbox events`
      );
    } catch (error) {
      logger.error('Error in outbox relay processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Process a single event with retry logic
  private async processEventWithRetry(outboxEvent: {
    id: number;
    userId: number;
    eventType: string;
    eventData: unknown;
    processed: boolean;
    createdAt: Date;
    processedAt: Date | null;
  }): Promise<boolean> {
    let attempt = 0;

    while (attempt < this.MAX_RETRY_ATTEMPTS) {
      try {
        // Parse the event data
        const userEvent = outboxEvent.eventData as UserEvent;

        // Publish the event to Redis
        await publishUserEvent(userEvent);

        // Mark as processed in a transaction
        await prisma.userEventOutbox.update({
          where: {
            id: outboxEvent.id,
          },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });

        logger.debug(
          `Successfully processed outbox event ${outboxEvent.id}: ${userEvent.eventType} for user ${userEvent.userId} (attempt ${attempt + 1})`
        );
        return true;
      } catch (eventError) {
        attempt++;
        logger.warn(
          `Failed to process outbox event ${outboxEvent.id} (attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}):`,
          eventError
        );

        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          // Wait before retrying with exponential backoff
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    return false;
  }

  // Helper method for async sleep
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Manual trigger for processing (useful for testing or immediate processing)
  async processNow(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Outbox processing is already in progress');
      return;
    }

    logger.info('Manually triggering outbox processing...');
    await this.processOutboxEvents();
  }

  // Get processing statistics
  async getStats(): Promise<{
    totalEvents: number;
    processedEvents: number;
    pendingEvents: number;
  }> {
    try {
      const [totalEvents, processedEvents] = await Promise.all([
        prisma.userEventOutbox.count(),
        prisma.userEventOutbox.count({
          where: { processed: true },
        }),
      ]);

      const pendingEvents = totalEvents - processedEvents;

      return {
        totalEvents,
        processedEvents,
        pendingEvents,
      };
    } catch (error) {
      logger.error('Error getting outbox stats:', error);
      throw error;
    }
  }
}

export default new OutboxRelayService();
