import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REALTIME_SERVICE_URL } from '../config/environment';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
  }

  async connect() {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      
      if (!token) {
        throw new Error('No access token found');
      }

      const SOCKET_URL = REALTIME_SERVICE_URL;

      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
      });

      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        this.socket.on('connected', (data) => {
          this.isConnected = true;
          console.log('Socket connected:', data);
          resolve(data);
        });

        this.socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          this.isConnected = false;
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          this.isConnected = false;
        });
      });
    } catch (error) {
      console.error('Failed to connect socket:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.socket.emit('user_online');
      console.log('Socket connected successfully');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log('Socket disconnected');
    });

    // Forward events to registered listeners
    this.socket.onAny((eventName, ...args) => {
      const listeners = this.listeners.get(eventName) || [];
      listeners.forEach(callback => callback(...args));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  // Event subscription management
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventName) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  off(eventName, callback) {
    const listeners = this.listeners.get(eventName) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  emit(eventName, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(eventName, data);
    } else {
      console.warn('Socket not connected, cannot emit:', eventName);
    }
  }

  // Conversation management
  joinConversation(conversationId) {
    this.emit('join_conversation', conversationId);
  }

  leaveConversation(conversationId) {
    this.emit('leave_conversation', conversationId);
  }

  // Typing indicators
  startTyping(conversationId) {
    this.emit('typing_start', { conversationId });
  }

  stopTyping(conversationId) {
    this.emit('typing_stop', { conversationId });
  }

  // Message actions
  markAsRead(conversationId) {
    this.emit('mark_read', { conversationId });
  }

  // User status
  updateStatus(status) {
    this.emit('update_status', { status });
  }

  // Connection health
  ping() {
    if (this.socket && this.isConnected) {
      this.socket.emit('ping');
    }
  }

  // Get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id,
    };
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;