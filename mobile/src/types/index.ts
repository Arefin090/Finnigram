// User Types
export interface User {
  id: number;
  user_id?: number; // for backward compatibility
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

// Message Types
export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file';
  status: 'sent' | 'delivered' | 'read';
  created_at: string;
  updated_at: string;
  delivered_at?: string | undefined;
  read_at?: string | undefined;
}

// Conversation Types
export interface Conversation {
  id: number;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  participants: User[];
  created_at: string;
  updated_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success?: boolean;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  message?: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  data?: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface MessagesResponse {
  messages: Message[];
}

export interface UsersResponse {
  users: User[];
}

// Navigation Types
export interface ChatScreenParams {
  conversationId: number;
  conversationName?: string;
  conversationType: 'direct' | 'group';
}

export interface AuthStackParamList {
  Login: undefined;
  Register: undefined;
  [key: string]: undefined | object;
}

export interface MainStackParamList {
  Conversations: undefined;
  Chat: ChatScreenParams;
  UserSearch: undefined;
  [key: string]: undefined | object;
}

export interface TabParamList {
  Chats: undefined;
  Profile: undefined;
  [key: string]: undefined | object;
}

export interface RootStackParamList {
  Login: undefined;
  Register: undefined;
  Conversations: undefined;
  Chat: ChatScreenParams;
  Profile: undefined;
  UserSearch: undefined;
}

// Context Types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

export interface ChatState {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
}

// Socket Types
export interface SocketMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  created_at: string;
  updated_at?: string;
  delivered_at?: string;
  read_at?: string;
}

export interface TypingData {
  conversationId: number;
  userId: number;
  isTyping: boolean;
}

export interface MessageDeliveredData {
  conversationId: number;
  messageId: number;
  deliveredAt: string;
}

export interface MessageReadData {
  conversationId: number;
  messageId: number;
  readAt: string;
}

export interface ConversationReadData {
  conversationId: number;
  messageIds: number[];
  readAt: string;
}

// Form Types
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

// Environment Types
export interface Environment {
  USER_SERVICE_URL: string;
  MESSAGE_SERVICE_URL: string;
  REALTIME_SERVICE_URL: string;
}

// Component Props Types
export interface LoadingScreenProps {
  message?: string;
}

export interface ConversationItemProps {
  conversation: Conversation;
  onPress: (conversation: Conversation) => void;
  isOnline?: boolean;
}

export interface MessageItemProps {
  message: Message;
  isMyMessage: boolean;
  user: User;
}

// Utility Types
export type ConversationCreateData = {
  type: 'direct' | 'group';
  participants: number[];
  name: string | undefined;
  description: string | undefined;
};

export type MessageSendData = {
  conversationId: number;
  content: string;
  messageType: 'text' | 'image' | 'file';
};

export type UserSearchParams = {
  query: string;
  limit?: number;
};
