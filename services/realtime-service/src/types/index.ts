import { Socket } from 'socket.io';

// User-related types
export interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
}

export interface UserPresence {
  status: 'online' | 'offline' | 'away' | 'busy' | 'invisible';
  socketId?: string;
  lastSeen: number;
}

// Socket extension interface
export interface AuthenticatedSocket extends Socket {
  user: User;
  userId: number;
  currentConversation?: number;
  lastHeartbeat?: number;
}

// Message-related types
export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: string;
  reply_to?: number;
  status: string;
  delivered_at?: string;
  read_at?: string;
  edited_at?: string;
  deleted_at?: string;
  created_at: string;
}

export interface MessageAttachment {
  id: number;
  message_id: number;
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
}

// Conversation-related types
export interface Conversation {
  id: number;
  type: string;
  name?: string;
  description?: string;
  avatar_url?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationParticipant {
  id: number;
  conversation_id: number;
  user_id: number;
  role: string;
  joined_at: string;
  last_read_at?: string;
}

// Socket event types
export interface JoinConversationData {
  conversationId: number;
}

export interface LeaveConversationData {
  conversationId: number;
}

export interface TypingData {
  conversationId: number;
}

export interface MarkReadData {
  conversationId: number;
}

export interface MessageReactionData {
  messageId: number;
  reaction: string;
  conversationId: number;
}

export interface UpdateStatusData {
  status: 'online' | 'away' | 'busy' | 'invisible';
}

// Socket event response types
export interface ConnectedResponse {
  message: string;
  user: {
    id: number;
    username: string;
    displayName: string;
  };
  timestamp: number;
}

export interface TypingUsersResponse {
  conversationId: number;
  typingUsers: number[];
}

export interface UserTypingEvent {
  userId: number;
  username: string;
  conversationId: number;
  isTyping: boolean;
}

export interface MessageReadEvent {
  userId: number;
  conversationId: number;
  timestamp: number;
}

export interface MessageReactionEvent {
  messageId: number;
  userId: number;
  username: string;
  reaction: string;
  timestamp: number;
}

export interface UserStatusUpdateEvent {
  userId: number;
  username: string;
  status: string;
  timestamp: number;
}

// Redis pub/sub message types
export interface RedisPresenceMessage {
  userId: number;
  status: string;
  timestamp: number;
}

export interface RedisTypingMessage {
  userId: number;
  conversationId: number;
  isTyping: boolean;
  timestamp: number;
}

export interface RedisConversationCreatedMessage {
  userId: number;
  conversation: Conversation;
}

export interface RedisMessageDeliveredMessage {
  messageId: number;
  conversationId: number;
  userId: number;
  deliveredAt: string;
}

export interface RedisMessageReadMessage {
  messageId: number;
  conversationId: number;
  userId: number;
  readAt: string;
}

export interface RedisConversationReadMessage {
  conversationId: number;
  userId: number;
  messageIds: number[];
  readAt: string;
}

export interface RedisMessageDeleteMessage {
  messageId: number;
  conversationId: number;
  timestamp: number;
}

// Health and metrics types
export interface HealthStatus {
  status: string;
  service: string;
  connectedUsers: number;
  timestamp: string;
  uptime: number;
  version: string;
}

export interface ConversationRoom {
  room: string;
  participants: number;
}

export interface MetricsResponse {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  websocket: {
    connectedSockets: number;
    onlineUsers: number;
    activeConversations: number;
    rooms: ConversationRoom[];
  };
  timestamp: string;
}

export interface SocketConnection {
  socketId: string;
  userId?: number;
  username?: string;
  currentConversation?: number;
  connected: boolean;
  lastHeartbeat?: number;
}

export interface SocketStatusResponse {
  totalConnections: number;
  connections: SocketConnection[];
}

// API response types (from other services)
export interface UserServiceAuthResponse {
  user: User;
  token?: string;
}

export interface MessageServiceConversationResponse {
  conversation: Conversation;
  participants: ConversationParticipant[];
}

// Error types
export interface SocketError {
  message: string;
  code?: string;
}