// Message status types and state machine for conversation-level read tracking

export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export interface MessageStatusEvent {
  id?: number;
  messageId: number;
  conversationId: number;
  userId: number;
  status: MessageStatus;
  previousStatus?: MessageStatus;
  timestamp: Date;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationReadStatus {
  conversationId: number;
  userId: number;
  lastReadMessageId: number | null;
  lastReadAt: Date | null;
  unreadCount: number;
}

// Message Status State Machine
export class MessageStatusStateMachine {
  private static readonly validTransitions: Record<
    MessageStatus,
    MessageStatus[]
  > = {
    [MessageStatus.SENDING]: [MessageStatus.SENT, MessageStatus.FAILED],
    [MessageStatus.SENT]: [MessageStatus.DELIVERED, MessageStatus.FAILED],
    [MessageStatus.DELIVERED]: [MessageStatus.READ],
    [MessageStatus.READ]: [], // Terminal state
    [MessageStatus.FAILED]: [MessageStatus.SENDING], // Allow retry
  };

  static canTransition(from: MessageStatus, to: MessageStatus): boolean {
    const allowedTransitions = this.validTransitions[from] || [];
    return allowedTransitions.includes(to);
  }

  static validateTransition(from: MessageStatus, to: MessageStatus): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid status transition from ${from} to ${to}. Allowed transitions: ${this.validTransitions[from]?.join(', ') || 'none'}`
      );
    }
  }

  static getNextValidStatuses(current: MessageStatus): MessageStatus[] {
    return this.validTransitions[current] || [];
  }

  static isTerminalStatus(status: MessageStatus): boolean {
    return this.validTransitions[status].length === 0;
  }

  static getStatusPriority(status: MessageStatus): number {
    // Higher number = higher priority (for determining conversation-level status)
    const priorities = {
      [MessageStatus.FAILED]: 0,
      [MessageStatus.SENDING]: 1,
      [MessageStatus.SENT]: 2,
      [MessageStatus.DELIVERED]: 3,
      [MessageStatus.READ]: 4,
    };
    return priorities[status] || 0;
  }
}

// Helper functions for status management
export class MessageStatusUtils {
  static createStatusEvent(
    messageId: number,
    conversationId: number,
    userId: number,
    status: MessageStatus,
    previousStatus?: MessageStatus,
    deviceId?: string,
    metadata?: Record<string, unknown>
  ): Omit<MessageStatusEvent, 'id'> {
    return {
      messageId,
      conversationId,
      userId,
      status,
      previousStatus,
      timestamp: new Date(),
      deviceId,
      metadata,
    };
  }

  static determineConversationStatus(
    userMessages: Array<{ status: MessageStatus; createdAt: Date }>
  ): MessageStatus | null {
    if (userMessages.length === 0) return null;

    // Sort by creation time (newest first)
    const sortedMessages = userMessages.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    // Find the most recent message that's not in 'sending' or 'failed' state
    const latestConfirmedMessage = sortedMessages.find(
      msg =>
        msg.status !== MessageStatus.SENDING &&
        msg.status !== MessageStatus.FAILED
    );

    return latestConfirmedMessage?.status || sortedMessages[0].status;
  }

  static getStatusDisplayText(status: MessageStatus): string {
    switch (status) {
      case MessageStatus.SENDING:
        return 'Sending...';
      case MessageStatus.SENT:
        return 'Sent';
      case MessageStatus.DELIVERED:
        return 'Delivered';
      case MessageStatus.READ:
        return 'Seen';
      case MessageStatus.FAILED:
        return 'Failed';
      default:
        return '';
    }
  }
}
