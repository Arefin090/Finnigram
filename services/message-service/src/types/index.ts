// Database entity types
export interface User {
  id: number;
  username: string;
  display_name?: string;
  email: string;
}

export interface ConversationWithParticipants {
  id: number;
  type: string;
  name?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
  participants: User[];
  last_message?: string | null;
  last_message_at?: Date;
  last_read_at?: Date | null;
  unread_count?: number;
}

export interface MessageAttachment {
  id?: number;
  fileUrl: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

export interface ReplyMessage {
  id: number;
  content: string;
  senderId: number;
  createdAt: Date;
}

export interface MessageWithAttachments {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: string;
  reply_to?: number | null;
  status: string;
  delivered_at?: Date | null;
  read_at?: Date | null;
  edited_at?: Date | null;
  deleted_at?: Date | null;
  created_at: Date;
  attachments: MessageAttachment[];
  reply_message?: ReplyMessage;
}

export interface ConversationParticipant {
  user_id: number;
  role: string;
  joined_at: Date;
  last_read_at?: Date | null;
}

// Request/Response types
export interface CreateMessageRequest {
  conversationId: number;
  content: string;
  messageType?: string;
  replyTo?: number;
  attachments?: MessageAttachment[];
}

export interface CreateConversationRequest {
  type: string;
  name?: string;
  description?: string;
  participants: number[];
}

export interface MessageSearchQuery {
  q: string;
  limit?: number;
}

export interface MessageListQuery {
  limit?: number;
  offset?: number;
}

// Authentication types
export interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
}

export interface AuthenticatedRequest extends Express.Request {
  user: AuthenticatedUser;
}

// Redis event types
export interface MessageEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface NewMessageEvent {
  event: 'new_message';
  data: MessageWithAttachments;
}

export interface MessageDeliveredEvent {
  event: 'message_delivered';
  data: {
    messageId: number;
    conversationId: number;
    userId: number;
    deliveredAt: Date;
  };
}

export interface MessageReadEvent {
  event: 'message_read';
  data: {
    messageId: number;
    conversationId: number;
    userId: number;
    readAt: Date;
  };
}

export interface ConversationReadEvent {
  event: 'conversation_read';
  data: {
    conversationId: number;
    userId: number;
    messageIds: number[];
    readAt: string;
  };
}

export interface ConversationCreatedEvent {
  event: 'conversation_created';
  data: {
    userId: number;
    conversation: ConversationWithParticipants;
  };
}

// Service method parameter types
export interface CreateMessageParams {
  conversationId: number;
  senderId: number;
  content: string;
  messageType?: string;
  replyTo?: number;
  attachments?: MessageAttachment[];
}

export interface CreateConversationParams {
  type: string;
  name?: string;
  description?: string;
  createdBy: number;
  participants?: number[];
}

// API Response types
export interface ApiResponse<T = unknown> {
  message?: string;
  data?: T;
  error?: string;
  details?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Error types
export interface ValidationError extends Error {
  name: 'ValidationError';
  details?: Array<{ message: string }>;
}

export interface DatabaseError extends Error {
  code?: string;
}

// Health check types
export interface HealthStatus {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
  version: string;
}

export interface MetricsResponse {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  database: {
    totalConversations: number;
    totalMessages: number;
    totalParticipants: number;
  };
  redis: {
    connected: boolean;
  };
  timestamp: string;
}
