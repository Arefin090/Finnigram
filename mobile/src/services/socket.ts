import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REALTIME_SERVICE_URL } from '../config/environment';
import {
  SocketMessage,
  TypingData,
  MessageDeliveredData,
  MessageReadData,
  ConversationReadData,
  Conversation,
} from '../types';

interface SocketEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  new_message: (message: SocketMessage) => void;
  conversation_created: (conversation: Conversation) => void;
  user_typing: (data: TypingData) => void;
  message_delivered: (data: MessageDeliveredData) => void;
  message_read: (data: MessageReadData) => void;
  conversation_read: (data: ConversationReadData) => void;
}

type EventCallback<T = unknown> = (data: T) => void;
type UnsubscribeFunction = () => void;

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 1000;
  private currentUserId: number | null = null;

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }

  async connect(userId: number): Promise<void> {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No access token found');
      }

      console.log('🔌 Connecting to socket server...');
      this.currentUserId = userId;

      this.socket = io(REALTIME_SERVICE_URL, {
        auth: { token },
        transports: ['websocket'],
        upgrade: true,
        rememberUpgrade: true,
      });

      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to connect to socket:', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Socket connected successfully');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('❌ Socket disconnected:', reason);
      this.handleReconnection();
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
      this.handleReconnection();
    });
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );

      setTimeout(() => {
        if (this.currentUserId) {
          this.connect(this.currentUserId);
        }
      }, this.reconnectInterval * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
      this.currentUserId = null;
      this.reconnectAttempts = 0;
    }
  }

  // Event listeners
  on<K extends keyof SocketEvents>(
    event: K,
    callback: SocketEvents[K]
  ): UnsubscribeFunction {
    if (!this.socket) {
      console.warn(`Cannot listen to ${event}: Socket not connected`);
      return () => {};
    }

    this.socket.on(event as string, callback as (...args: unknown[]) => void);

    return () => {
      if (this.socket) {
        this.socket.off(event as string, callback as (...args: unknown[]) => void);
      }
    };
  }

  // Generic event listener for any event
  onAny(callback: EventCallback): UnsubscribeFunction {
    if (!this.socket) {
      console.warn('Cannot listen to events: Socket not connected');
      return () => {};
    }

    this.socket.onAny(callback);

    return () => {
      if (this.socket) {
        this.socket.offAny(callback);
      }
    };
  }

  // Emit events
  emit(event: string, data?: unknown): void {
    if (!this.socket?.connected) {
      console.warn(`Cannot emit ${event}: Socket not connected`);
      return;
    }

    this.socket.emit(event, data);
  }

  // Conversation management
  joinConversation(conversationId: number): void {
    this.emit('join_conversation', { conversationId });
  }

  leaveConversation(conversationId: number): void {
    this.emit('leave_conversation', { conversationId });
  }

  // Typing indicators
  startTyping(conversationId: number): void {
    this.emit('start_typing', { conversationId });
  }

  stopTyping(conversationId: number): void {
    this.emit('stop_typing', { conversationId });
  }

  // Connection status
  getConnectionStatus(): { isConnected: boolean; userId: number | null } {
    return {
      isConnected: this.isConnected,
      userId: this.currentUserId,
    };
  }
}

// Export singleton instance
const socketService = new SocketService();
export default socketService;
