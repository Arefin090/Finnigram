import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = __DEV__ ? 'http://localhost' : 'https://api.finnigram.app';

// Service URLs
export const USER_SERVICE_URL = `${BASE_URL}:3001/api`;
export const MESSAGE_SERVICE_URL = `${BASE_URL}:3002/api`;
export const REALTIME_SERVICE_URL = `${BASE_URL}:3003`;

// Create axios instances for each service
const userApi = axios.create({
  baseURL: USER_SERVICE_URL,
  timeout: 10000,
});

const messageApi = axios.create({
  baseURL: MESSAGE_SERVICE_URL,
  timeout: 10000,
});

// Request interceptors to add auth tokens
const addAuthInterceptor = (apiInstance) => {
  apiInstance.interceptors.request.use(
    async (config) => {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
};

// Response interceptors to handle token refresh
const addResponseInterceptor = (apiInstance) => {
  apiInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        
        try {
          const refreshToken = await AsyncStorage.getItem('refreshToken');
          if (refreshToken) {
            const response = await userApi.post('/auth/refresh', { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = response.data.tokens;
            
            await AsyncStorage.setItem('accessToken', accessToken);
            await AsyncStorage.setItem('refreshToken', newRefreshToken);
            
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return apiInstance(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed, redirect to login
          await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
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
  login: (email, password) => userApi.post('/auth/login', { email, password }),
  register: (email, username, password, displayName) => 
    userApi.post('/auth/register', { email, username, password, displayName }),
  logout: () => userApi.post('/auth/logout'),
  getCurrentUser: () => userApi.get('/auth/me'),
  refreshToken: (refreshToken) => userApi.post('/auth/refresh', { refreshToken }),
};

// User API
export const userApiExports = {
  getProfile: (userId) => userApi.get(`/users/${userId}`),
  updateProfile: (data) => userApi.patch('/users/me', data),
  searchUsers: (query, limit = 10) => userApi.get('/users', { params: { q: query, limit } }),
};

// Message API
export const messageApiExports = {
  getConversations: () => messageApi.get('/conversations'),
  createConversation: (data) => messageApi.post('/conversations', data),
  getConversation: (id) => messageApi.get(`/conversations/${id}`),
  addParticipant: (conversationId, userId) => 
    messageApi.post(`/conversations/${conversationId}/participants`, { userId }),
  removeParticipant: (conversationId, userId) => 
    messageApi.delete(`/conversations/${conversationId}/participants/${userId}`),
  markAsRead: (conversationId) => messageApi.patch(`/conversations/${conversationId}/read`),
  getMessages: (conversationId, limit = 50, offset = 0) => 
    messageApi.get(`/messages/conversations/${conversationId}`, { params: { limit, offset } }),
  sendMessage: (data) => messageApi.post('/messages', data),
  editMessage: (messageId, content) => messageApi.patch(`/messages/${messageId}`, { content }),
  deleteMessage: (messageId) => messageApi.delete(`/messages/${messageId}`),
  searchMessages: (query, limit = 20) => 
    messageApi.get('/messages/search', { params: { q: query, limit } }),
};

export { userApi, messageApi };