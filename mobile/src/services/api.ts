import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_SERVICE_URL, MESSAGE_SERVICE_URL } from '../config/environment';

// Type definitions for better type safety
interface User {
  id: number;
  username: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: string;
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  attachments?: unknown[];
}

interface Conversation {
  id: number;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar_url?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  participants?: User[];
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
}

interface LoginResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

// Response wrapper interfaces that match actual backend responses
interface AuthUserResponse {
  user: User;
}

interface ConversationCreateResponse {
  message: string;
  conversation: Conversation;
}

interface UserSearchResponse {
  users: User[];
}

interface MessagesResponse {
  messages: Message[];
}

interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

interface SendMessageRequest {
  conversationId: number;
  content: string;
  messageType?: string;
}

interface CreateConversationRequest {
  type: 'direct' | 'group';
  participantIds: number[];
  name?: string;
  description?: string;
}

// Create axios instances for each service
const userApi: AxiosInstance = axios.create({
  baseURL: USER_SERVICE_URL,
  timeout: 3000,
});

const messageApi: AxiosInstance = axios.create({
  baseURL: MESSAGE_SERVICE_URL,
  timeout: 3000,
});

// Request interceptors to add auth tokens
const addAuthInterceptor = (apiInstance: AxiosInstance): void => {
  apiInstance.interceptors.request.use(
    async (
      config: InternalAxiosRequestConfig
    ): Promise<InternalAxiosRequestConfig> => {
      const token = await AsyncStorage.getItem('accessToken');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error: Error) => Promise.reject(error)
  );
};

// Response interceptors to handle token refresh
const addResponseInterceptor = (apiInstance: AxiosInstance): void => {
  apiInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: {
      config: InternalAxiosRequestConfig & { _retry?: boolean };
      response?: { status: number };
    }) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const refreshToken = await AsyncStorage.getItem('refreshToken');
          if (refreshToken) {
            const response = await userApi.post('/auth/refresh', {
              refreshToken,
            });
            const { accessToken, refreshToken: newRefreshToken } =
              response.data.tokens;

            await AsyncStorage.setItem('accessToken', accessToken);
            await AsyncStorage.setItem('refreshToken', newRefreshToken);

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return apiInstance(originalRequest);
          }
        } catch {
          // Refresh failed, redirect to login
          await AsyncStorage.multiRemove([
            'accessToken',
            'refreshToken',
            'user',
          ]);
        }
      }

      return Promise.reject(error);
    }
  );
};

// Apply interceptors
addAuthInterceptor(userApi);
addAuthInterceptor(messageApi);
addResponseInterceptor(userApi);
addResponseInterceptor(messageApi);

// Auth API
export const authApi = {
  login: (
    email: string,
    password: string
  ): Promise<AxiosResponse<LoginResponse>> =>
    userApi.post('/auth/login', { email, password }),

  register: (
    email: string,
    username: string,
    password: string,
    displayName?: string
  ): Promise<AxiosResponse<LoginResponse>> =>
    userApi.post('/auth/register', { email, username, password, displayName }),

  logout: (): Promise<AxiosResponse<void>> =>
    userApi.post('/auth/logout', {}, { timeout: 5000 }), // 5 second timeout

  getCurrentUser: (): Promise<AxiosResponse<AuthUserResponse>> =>
    userApi.get('/auth/me'),

  refreshToken: (
    refreshToken: string
  ): Promise<
    AxiosResponse<{ tokens: { accessToken: string; refreshToken: string } }>
  > => userApi.post('/auth/refresh', { refreshToken }),
};

// User API
export const userApiExports = {
  getProfile: (userId: number): Promise<AxiosResponse<User>> =>
    userApi.get(`/users/${userId}`),

  updateProfile: (data: Partial<User>): Promise<AxiosResponse<User>> =>
    userApi.patch('/users/me', data),

  searchUsers: (
    query: string,
    limit: number = 10
  ): Promise<AxiosResponse<UserSearchResponse>> =>
    userApi.get('/users', { params: { q: query, limit } }),
};

// Message API
export const messageApiExports = {
  getConversations: (
    limit: number = 20,
    offset: number = 0
  ): Promise<
    AxiosResponse<{
      conversations: Conversation[];
      total?: number;
      hasMore?: boolean;
    }>
  > => messageApi.get('/conversations', { params: { limit, offset } }),

  createConversation: (
    data: CreateConversationRequest
  ): Promise<AxiosResponse<ConversationCreateResponse>> =>
    messageApi.post('/conversations', data),

  getConversation: (id: number): Promise<AxiosResponse<Conversation>> =>
    messageApi.get(`/conversations/${id}`),

  addParticipant: (
    conversationId: number,
    userId: number
  ): Promise<AxiosResponse<void>> =>
    messageApi.post(`/conversations/${conversationId}/participants`, {
      userId,
    }),

  removeParticipant: (
    conversationId: number,
    userId: number
  ): Promise<AxiosResponse<void>> =>
    messageApi.delete(
      `/conversations/${conversationId}/participants/${userId}`
    ),

  markAsRead: (conversationId: number): Promise<AxiosResponse<void>> =>
    messageApi.patch(`/conversations/${conversationId}/read`),

  markMessageAsDelivered: (messageId: number): Promise<AxiosResponse<void>> =>
    messageApi.patch(`/messages/${messageId}/delivered`),

  markMessageAsRead: (messageId: number): Promise<AxiosResponse<void>> =>
    messageApi.patch(`/messages/${messageId}/read`),

  getMessages: (
    conversationId: number,
    limit: number = 50,
    offset: number = 0
  ): Promise<AxiosResponse<MessagesResponse>> =>
    messageApi.get(`/messages/conversations/${conversationId}`, {
      params: { limit, offset, order: 'asc' }, // Request messages in chronological order
    }),

  sendMessage: (data: SendMessageRequest): Promise<AxiosResponse<Message>> =>
    messageApi.post('/messages', data),

  editMessage: (
    messageId: number,
    content: string
  ): Promise<AxiosResponse<Message>> =>
    messageApi.patch(`/messages/${messageId}`, { content }),

  deleteMessage: (messageId: number): Promise<AxiosResponse<void>> =>
    messageApi.delete(`/messages/${messageId}`),

  searchMessages: (
    query: string,
    limit: number = 20
  ): Promise<AxiosResponse<{ messages: Message[] }>> =>
    messageApi.get('/messages/search', { params: { q: query, limit } }),
};

// API Response validation helpers
const validateAuthUserResponse = (data: unknown): data is AuthUserResponse => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'user' in data &&
    typeof (data as AuthUserResponse).user === 'object' &&
    (data as AuthUserResponse).user !== null &&
    'id' in (data as AuthUserResponse).user
  );
};

const validateConversationCreateResponse = (
  data: unknown
): data is ConversationCreateResponse => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'conversation' in data &&
    typeof (data as ConversationCreateResponse).conversation === 'object' &&
    (data as ConversationCreateResponse).conversation !== null &&
    'id' in (data as ConversationCreateResponse).conversation
  );
};

// Validated API wrapper for critical endpoints
export const validatedAuthApi = {
  ...authApi,
  getCurrentUser: async (): Promise<AxiosResponse<AuthUserResponse>> => {
    const response = await authApi.getCurrentUser();

    if (!validateAuthUserResponse(response.data)) {
      throw new Error('Invalid response structure from getCurrentUser API');
    }

    return response;
  },
};

export const validatedMessageApi = {
  ...messageApiExports,
  createConversation: async (
    data: CreateConversationRequest
  ): Promise<AxiosResponse<ConversationCreateResponse>> => {
    const response = await messageApiExports.createConversation(data);

    if (!validateConversationCreateResponse(response.data)) {
      throw new Error('Invalid response structure from createConversation API');
    }

    return response;
  },
};

export { userApi, messageApi };

// Export types for use in other files
export type {
  User,
  Message,
  Conversation,
  LoginResponse,
  RegisterRequest,
  SendMessageRequest,
  CreateConversationRequest,
};
