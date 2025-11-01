import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REALTIME_SERVICE_URL } from '../config/environment';
import logger from './loggerConfig';

// Type definitions for socket events and data
interface SocketEventCallback {
  (...args: unknown[]): void;
}

interface QueuedMessage {
  event: string;
  data: unknown;
}

interface SocketConnectionData {
  message?: string;
  userId?: number;
  [key: string]: unknown;
}

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, SocketEventCallback[]> = new Map();

  // Connection state
  public isConnected: boolean = false;

  // Reconnection properties
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  private readonly maxReconnectDelay: number = 30000; // Max 30 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: QueuedMessage[] = []; // Queue messages while disconnected

  constructor() {
    // All initialization is done in property declarations above
  }

  public async connect(
    isReconnect: boolean = false
  ): Promise<SocketConnectionData> {
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

      return new Promise<SocketConnectionData>((resolve, reject) => {
        if (!this.socket) {
          reject(new Error('Socket failed to initialize'));
          return;
        }

        this.socket.on('connected', (data: SocketConnectionData) => {
          this.isConnected = true;

          // Reset reconnection state on successful connection
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;

          // Process queued messages
          this.processMessageQueue();

          logger.socket('Socket connected:', data);
          resolve(data);
        });

        this.socket.on('connect_error', (error: Error) => {
          logger.error('SOCKET', 'Socket connection error:', error);
          this.isConnected = false;

          // Attempt reconnection if not max attempts reached
          if (!isReconnect) {
            this.scheduleReconnect();
          }

          reject(error);
        });

        this.socket.on('disconnect', (reason: string) => {
          logger.socket('Socket disconnected:', reason);
          this.isConnected = false;

          // Auto-reconnect unless disconnect was intentional
          if (reason !== 'io client disconnect') {
            this.scheduleReconnect();
          }
        });
      });
    } catch (error) {
      logger.error('SOCKET', 'Failed to connect socket:', error);
      throw error;
    }
  }

  private scheduleReconnect(): void {
    // Clear existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('SOCKET', 'Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;

    logger.info(
      'SOCKET',
      `Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(true);
      } catch (error) {
        logger.error('SOCKET', 'Reconnection attempt failed:', error);

        // Exponential backoff - double the delay up to max
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay
        );
      }
    }, this.reconnectDelay);
  }

  private processMessageQueue(): void {
    if (this.messageQueue.length > 0) {
      logger.info(
        'SOCKET',
        `Processing ${this.messageQueue.length} queued messages`
      );

      this.messageQueue.forEach(message => {
        if (this.socket && this.isConnected) {
          this.socket.emit(message.event, message.data);
        }
      });

      this.messageQueue = [];
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.socket?.emit('user_online');
      logger.socket('Socket connected successfully');
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      logger.socket('Socket disconnected');
    });

    // Forward events to registered listeners
    this.socket.onAny((eventName: string, ...args: unknown[]) => {
      logger.socket('Socket received event:', eventName, 'with args:', args);
      const listeners = this.listeners.get(eventName) || [];
      logger.socket(
        'Socket forwarding to',
        listeners.length,
        'listeners for event:',
        eventName
      );
      listeners.forEach(callback => callback(...args));
    });
  }

  public disconnect(): void {
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    if (this.socket) {
      // Emit user_offline before disconnecting if still connected
      if (this.isConnected) {
        logger.socket('Emitting user_offline before disconnect...');
        this.socket.emit('user_offline');
      }

      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
      logger.socket('Socket disconnected and cleaned up');
    }
  }

  // Event subscription management
  public on(eventName: string, callback: SocketEventCallback): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventName) || [];
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  public off(eventName: string, callback: SocketEventCallback): void {
    const listeners = this.listeners.get(eventName) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  public emit(eventName: string, data: unknown): void {
    if (this.socket && this.isConnected) {
      this.socket.emit(eventName, data);
    } else {
      // Queue message for when connection is restored
      logger.info(
        'SOCKET',
        'Socket not connected, queuing message:',
        eventName
      );
      this.messageQueue.push({ event: eventName, data });

      // Try to reconnect if not already attempting
      if (this.reconnectAttempts === 0) {
        this.scheduleReconnect();
      }
    }
  }

  // Conversation management
  public joinConversation(conversationId: number): void {
    this.emit('join_conversation', conversationId);
  }

  public leaveConversation(conversationId: number): void {
    this.emit('leave_conversation', conversationId);
  }

  // Typing indicators
  public startTyping(conversationId: number): void {
    this.emit('typing_start', { conversationId });
  }

  public stopTyping(conversationId: number): void {
    this.emit('typing_stop', { conversationId });
  }

  // Message actions
  public markAsRead(conversationId: number): void {
    this.emit('mark_read', { conversationId });
  }

  // User status
  public updateStatus(status: string): void {
    this.emit('update_status', { status });
  }

  // Connection health
  public ping(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('ping');
    }
  }

  // Get connection status - matches original return type
  public getConnectionStatus(): { isConnected: boolean; socketId?: string } {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id,
    };
  }

  public getReconnectionAttempts(): number {
    return this.reconnectAttempts;
  }

  public getQueuedMessageCount(): number {
    return this.messageQueue.length;
  }
}

// Export a singleton instance
const socketService = new SocketService();
export default socketService;
