import axios, { AxiosInstance, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_SERVICE_URL, MESSAGE_SERVICE_URL } from '../config/environment';
import {
  ApiResponse,
  AuthResponse,
  User,
  LoginForm,
  RegisterForm,
  ConversationsResponse,
  MessagesResponse,
  UsersResponse,
  UserSearchParams,
  ConversationCreateData,
  MessageSendData,
  Conversation,
  Message,
} from '../types';

// Create axios instances for each service
const userApi: AxiosInstance = axios.create({
  baseURL: USER_SERVICE_URL,
  timeout: 10000,
});

const messageApi: AxiosInstance = axios.create({
  baseURL: MESSAGE_SERVICE_URL,
  timeout: 10000,
});

// Request interceptor to add auth tokens
const addAuthInterceptor = (apiInstance: AxiosInstance): void => {
  apiInstance.interceptors.request.use(async config => {
    const token = await AsyncStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response interceptor for token refresh
  apiInstance.interceptors.response.use(
    response => response,
    async error => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const refreshToken = await AsyncStorage.getItem('refreshToken');
          if (refreshToken) {
            const response = await userApi.post('/auth/refresh', {
              refreshToken,
            });

            const { accessToken } = response.data;
            await AsyncStorage.setItem('accessToken', accessToken);

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return apiInstance(originalRequest);
          }
        } catch (_refreshError) {
          // Refresh failed, redirect to login
          await AsyncStorage.multiRemove([
            'accessToken',
            'refreshToken',
            'user',
          ]);
          // Note: Navigation should be handled by the auth context
        }
      }

      return Promise.reject(error);
    }
  );
};

// Add interceptors to both instances
addAuthInterceptor(userApi);
addAuthInterceptor(messageApi);

// User Service APIs
export const userApiExports = {
  // Auth endpoints
  login: async (credentials: LoginForm): Promise<AuthResponse> => {
    const response: AxiosResponse<AuthResponse> = await userApi.post(
      '/auth/login',
      credentials
    );
    return response.data;
  },

  register: async (userData: RegisterForm): Promise<AuthResponse> => {
    const response: AxiosResponse<AuthResponse> = await userApi.post(
      '/auth/register',
      userData
    );
    return response.data;
  },

  logout: async (): Promise<ApiResponse<null>> => {
    const response: AxiosResponse<ApiResponse<null>> =
      await userApi.post('/auth/logout');
    return response.data;
  },

  getCurrentUser: async (): Promise<ApiResponse<{ user: User }>> => {
    const response: AxiosResponse<ApiResponse<{ user: User }>> =
      await userApi.get('/auth/me');
    return response.data;
  },

  // User management
  searchUsers: async (query: string): Promise<ApiResponse<UsersResponse>> => {
    const params: UserSearchParams = { query, limit: 20 };
    const response: AxiosResponse<ApiResponse<UsersResponse>> =
      await userApi.get('/users/search', { params });
    return response.data;
  },

  getUser: async (userId: number): Promise<ApiResponse<{ user: User }>> => {
    const response: AxiosResponse<ApiResponse<{ user: User }>> =
      await userApi.get(`/users/${userId}`);
    return response.data;
  },
};

// Message Service APIs
export const messageApiExports = {
  // Conversation management
  getConversations: async (): Promise<ApiResponse<ConversationsResponse>> => {
    const response: AxiosResponse<ApiResponse<ConversationsResponse>> =
      await messageApi.get('/conversations');
    return response.data;
  },

  createConversation: async (
    conversationData: ConversationCreateData
  ): Promise<ApiResponse<{ conversation: Conversation }>> => {
    const response: AxiosResponse<ApiResponse<{ conversation: Conversation }>> =
      await messageApi.post('/conversations', conversationData);
    return response.data;
  },

  getConversation: async (
    conversationId: number
  ): Promise<ApiResponse<{ conversation: Conversation }>> => {
    const response: AxiosResponse<ApiResponse<{ conversation: Conversation }>> =
      await messageApi.get(`/conversations/${conversationId}`);
    return response.data;
  },

  // Message management
  getMessages: async (
    conversationId: number
  ): Promise<ApiResponse<MessagesResponse>> => {
    const response: AxiosResponse<ApiResponse<MessagesResponse>> =
      await messageApi.get(`/conversations/${conversationId}/messages`);
    return response.data;
  },

  sendMessage: async (
    messageData: MessageSendData
  ): Promise<ApiResponse<{ message: Message }>> => {
    const response: AxiosResponse<ApiResponse<{ message: Message }>> =
      await messageApi.post(
        `/conversations/${messageData.conversationId}/messages`,
        {
          content: messageData.content,
          messageType: messageData.messageType,
        }
      );
    return response.data;
  },

  // Message status updates
  markAsRead: async (conversationId: number): Promise<ApiResponse<null>> => {
    const response: AxiosResponse<ApiResponse<null>> = await messageApi.put(
      `/conversations/${conversationId}/read`
    );
    return response.data;
  },

  markMessageAsDelivered: async (
    messageId: number
  ): Promise<ApiResponse<null>> => {
    const response: AxiosResponse<ApiResponse<null>> = await messageApi.put(
      `/messages/${messageId}/delivered`
    );
    return response.data;
  },

  markMessageAsRead: async (messageId: number): Promise<ApiResponse<null>> => {
    const response: AxiosResponse<ApiResponse<null>> = await messageApi.put(
      `/messages/${messageId}/read`
    );
    return response.data;
  },
};

// Helper function for error handling
export const handleApiError = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const err = error as {
      response?: { data?: { message?: string; error?: string } };
      message?: string;
    };
    if (err.response?.data?.message) {
      return err.response.data.message;
    }
    if (err.response?.data?.error) {
      return err.response.data.error;
    }
    if (err.message) {
      return err.message;
    }
  }
  return 'An unexpected error occurred';
};

export default { userApiExports, messageApiExports };
