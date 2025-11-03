import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { messageApiExports, type User, type Message } from '../services/api';
import socketService from '../services/socket';
import messageCache from '../utils/messageCache';
import logger from '../services/loggerConfig';
import ErrorBoundary from '../components/ErrorBoundary';
import { styles } from './ChatScreen.styles';

// Types for route params and navigation
interface RouteParams {
  conversationId: number;
  conversationName?: string;
  participants?: User[];
}

interface Navigation {
  goBack: () => void;
}

interface ChatScreenProps {
  route: {
    params: RouteParams;
  };
  navigation: Navigation;
}

// Socket event data types
interface SocketMessage {
  id: string | number;
  content: string;
  sender_id: number;
  conversation_id: number;
  message_type: string;
  created_at: string;
  attachments?: unknown[];
  delivered_at?: string | null;
  read_at?: string | null;
}

// Removed obsolete SocketServiceWithUnsubscribers interface
// Now using local ref for unsubscribers to prevent memory leaks

interface SocketTypingData {
  conversationId: number;
  userId: number;
  isTyping: boolean;
}

interface SocketMessageStatusData {
  conversationId: number;
  messageId: string | number;
  deliveredAt?: string;
  readAt?: string;
}

interface SocketConversationReadData {
  conversationId: number;
  messageIds: (string | number)[];
  readAt: string;
}

// Extended message type with optimistic UI states
interface ChatMessage extends Omit<Message, 'status' | 'id'> {
  id: string | number;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  correlationId?: string; // For tracking optimistic messages
  isOptimistic?: boolean; // Flag for optimistic messages
}

const ChatScreen: React.FC<ChatScreenProps> = ({ route, navigation }) => {
  const { conversationId, conversationName, participants } = route.params;
  const { user } = useAuth();
  const { updateConversationWithSort } = useChat();

  // Local state for this conversation only
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [queuedMessages, setQueuedMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const [loadingOlderMessages, setLoadingOlderMessages] =
    useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [currentMessageOffset, setCurrentMessageOffset] = useState<number>(0);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNearBottomRef = useRef<boolean>(true); // Assume user starts at bottom
  const shouldScrollToBottomRef = useRef<boolean>(false); // Track if we need to scroll on next render
  const unsubscribersRef = useRef<(() => void)[]>([]); // Store socket unsubscribers locally

  // Generate unique correlation ID for optimistic messages
  const generateCorrelationId = (): string => {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Animated values for typing dots
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  // Start typing animation when users are typing
  useEffect(() => {
    if (typingUsers.length > 0) {
      startTypingAnimation();
      // Auto-scroll to show typing dots only if user is near bottom
      smartScrollToBottom(true);
    } else {
      stopTypingAnimation();
    }
  }, [typingUsers]);

  // Typing dots animation
  const startTypingAnimation = (): void => {
    // Reset all dots first
    dot1Anim.setValue(0);
    dot2Anim.setValue(0);
    dot3Anim.setValue(0);

    const createBounceAnimation = (
      animValue: Animated.Value,
      delay: number = 0
    ) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(400), // Pause between cycles
        ])
      );
    };

    // Start animations with staggered delays for bouncing effect
    Animated.parallel([
      createBounceAnimation(dot1Anim, 0),
      createBounceAnimation(dot2Anim, 150),
      createBounceAnimation(dot3Anim, 300),
    ]).start();
  };

  const stopTypingAnimation = (): void => {
    dot1Anim.stopAnimation();
    dot2Anim.stopAnimation();
    dot3Anim.stopAnimation();

    // Reset to initial positions
    dot1Anim.setValue(0);
    dot2Anim.setValue(0);
    dot3Anim.setValue(0);
  };

  // Smart scroll that only scrolls if user is near bottom (with inverted list, scroll to top)
  const smartScrollToBottom = (animated: boolean = true): void => {
    if (isNearBottomRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated });
      }, 100);
    }
  };

  // Load older messages when user scrolls to top
  const loadOlderMessages = async (): Promise<void> => {
    if (loadingOlderMessages || !hasMoreMessages) return;

    setLoadingOlderMessages(true);
    logger.debug(
      'CHAT',
      'Loading older messages, offset:',
      currentMessageOffset
    );

    try {
      const BATCH_SIZE = 20;
      const response = await messageApiExports.getMessages(
        conversationId,
        BATCH_SIZE,
        currentMessageOffset
      );
      const olderMessages = response.data.messages || [];

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        logger.debug('CHAT', 'No more older messages available');
      } else {
        // Add older messages to the beginning, avoiding duplicates
        setMessages(prev => {
          const existingIds = new Set(prev.map(msg => msg.id));
          const existingCorrelationIds = new Set(
            prev.filter(msg => msg.correlationId).map(msg => msg.correlationId)
          );

          const newOlderMessages = olderMessages.filter(msg => {
            // Check for ID duplicates
            if (existingIds.has(msg.id)) return false;
            // Check for correlation ID conflicts (unlikely but safety check)
            const msgWithCorrelation = msg as ChatMessage;
            if (
              msgWithCorrelation.correlationId &&
              existingCorrelationIds.has(msgWithCorrelation.correlationId)
            )
              return false;
            return true;
          });

          return [...(newOlderMessages as ChatMessage[]), ...prev];
        });
        setCurrentMessageOffset(prev => prev + olderMessages.length);
      }
    } catch (error) {
      logger.error('CHAT', 'Failed to load older messages:', error);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Load messages when component mounts
  useEffect(() => {
    logger.info('CHAT', 'ChatScreen mounted for conversation:', conversationId);
    loadMessages();
    joinConversation();

    // Listen for socket connection and join room when ready
    const handleSocketConnect = () => {
      logger.socket('Socket connected, joining conversation room');
      joinConversation();
    };

    socketService.on('connect', handleSocketConnect);

    // AUTO-READ: Mark conversation as read when user opens it
    setTimeout(async () => {
      try {
        await messageApiExports.markAsRead(conversationId);
        logger.info(
          'CHAT',
          'Auto-marked conversation as read:',
          conversationId
        );
      } catch (error) {
        logger.error(
          'CHAT',
          'Failed to auto-mark conversation as read:',
          error
        );
      }
    }, 500); // Small delay to ensure messages are loaded first

    return () => {
      // Clear typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      socketService.off('connect', handleSocketConnect);
      leaveConversation();
      cleanupSocketListeners(); // Ensure all listeners are cleaned up
    };
  }, [conversationId]);

  // Load messages with cache-first strategy for instant UX
  const loadMessages = async (): Promise<void> => {
    try {
      // 1. Check cache first and show immediately if available
      logger.debug('CACHE', 'Checking cache for conversation:', conversationId);
      const cachedMessages =
        await messageCache.getSmartCachedMessages(conversationId);

      let hasCachedData = false;
      if (cachedMessages && cachedMessages.length > 0) {
        // Show cached messages IMMEDIATELY - no skeleton loading
        setMessages(cachedMessages as ChatMessage[]);
        setCurrentMessageOffset(cachedMessages.length);
        setHasMoreMessages(cachedMessages.length >= 30);
        setLoading(false); // Hide skeleton immediately
        shouldScrollToBottomRef.current = true;

        hasCachedData = true;
        logger.performance(
          'CACHE',
          'Showing',
          cachedMessages.length,
          'cached messages instantly'
        );
      } else {
        // No cache available, show skeleton while loading
        setLoading(true);
      }

      // 2. Fetch only RECENT messages from API (progressive loading)
      logger.network(
        'Loading recent messages from API for conversation:',
        conversationId
      );
      const INITIAL_MESSAGE_LIMIT = 30; // Only load recent messages initially
      const response = await messageApiExports.getMessages(
        conversationId,
        INITIAL_MESSAGE_LIMIT,
        0
      );
      const freshMessages = response.data.messages || [];

      // 3. Update with fresh data (background refresh)
      if (hasCachedData) {
        // Check for conflicts (messages that changed or were deleted)
        const hasConflicts =
          cachedMessages?.length !== freshMessages.length ||
          !cachedMessages?.every(cachedMsg => {
            const freshMsg = freshMessages.find(m => m.id === cachedMsg.id);
            return (
              freshMsg && JSON.stringify(cachedMsg) === JSON.stringify(freshMsg)
            );
          });

        if (hasConflicts) {
          logger.info(
            'CACHE',
            'Fresh data differs from cache, updating display'
          );
          setMessages(freshMessages as ChatMessage[]);
          setCurrentMessageOffset(freshMessages.length);
          setHasMoreMessages(freshMessages.length >= INITIAL_MESSAGE_LIMIT);
          await messageCache.refreshCacheFromAPI(conversationId, freshMessages);
        } else {
          logger.debug('CACHE', 'Cache is up to date, no refresh needed');
        }

        // Set high priority for active conversation
        await messageCache.setConversationPriority(conversationId, 'high');
      } else {
        // No cached data, show fresh messages from API
        setMessages(freshMessages as ChatMessage[]);
        setCurrentMessageOffset(freshMessages.length);
        setHasMoreMessages(freshMessages.length >= INITIAL_MESSAGE_LIMIT);
        shouldScrollToBottomRef.current = true;

        await messageCache.smartCacheMessages(
          conversationId,
          freshMessages,
          'high'
        );

        logger.performance(
          'API',
          'Loaded',
          freshMessages.length,
          'messages from API'
        );
      }

      // Background refresh completed
      logger.debug('CHAT', 'Message loading completed');
    } catch (error) {
      logger.error('CHAT', 'Failed to load messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);

      // Process queued messages after loading completes
      if (queuedMessages.length > 0) {
        logger.info(
          'CHAT',
          'Processing',
          queuedMessages.length,
          'queued messages'
        );

        // Add queued messages to UI, avoiding duplicates
        setMessages(prev => {
          const existingIds = new Set(prev.map(msg => msg.id));
          const newQueuedMessages = queuedMessages.filter(
            msg => !existingIds.has(msg.id)
          );
          return [...prev, ...newQueuedMessages];
        });

        // Send each queued message
        queuedMessages.forEach(async queuedMsg => {
          try {
            await messageApiExports.sendMessage({
              conversationId: queuedMsg.conversation_id,
              content: queuedMsg.content,
              messageType: queuedMsg.message_type,
            });

            // Note: Optimistic message will be automatically replaced by socket handler
            // when the real message arrives, so no need to manually remove it here
          } catch (error) {
            logger.error('CHAT', 'Failed to send queued message:', error);
            setMessages(prev =>
              prev.map(msg =>
                msg.id === queuedMsg.id ? { ...msg, status: 'failed' } : msg
              )
            );
          }
        });

        // Clear the queue and scroll to show new messages
        setQueuedMessages([]);
        shouldScrollToBottomRef.current = true; // Scroll after processing queued messages
      }
    }
  };

  // Join conversation socket room
  const joinConversation = (): void => {
    if (socketService.isConnected) {
      logger.socket('Joining socket room for conversation:', conversationId);
      socketService.joinConversation(conversationId);

      // Set up socket listeners for this conversation
      setupSocketListeners();
    } else {
      logger.socket('Socket not connected yet, will join when ready');
    }
  };

  // Leave conversation socket room
  const leaveConversation = (): void => {
    if (socketService.isConnected) {
      logger.socket('Leaving socket room for conversation:', conversationId);
      socketService.leaveConversation(conversationId);

      // Clean up socket listeners
      cleanupSocketListeners();
    }
  };

  // Set up socket event listeners
  const setupSocketListeners = (): void => {
    // Listen for new messages
    const unsubscribeNewMessage = socketService.onTyped<SocketMessage>(
      'new_message',
      (message: SocketMessage) => {
        if (message.conversation_id === conversationId) {
          logger.socket('Received new message via socket:', message.id);

          // Add message to local state
          setMessages(prevMessages => {
            // Check if message already exists to prevent duplicates
            const messageExists = prevMessages.some(m => m.id === message.id);
            if (messageExists) {
              logger.warn(
                'CHAT',
                'Message already exists, skipping:',
                message.id
              );
              return prevMessages;
            }

            // Check if this message should replace an optimistic message
            // (when sender_id matches current user, it's likely our optimistic message being confirmed)
            const isOurMessage = user && message.sender_id === user.id;
            let newMessages = [...prevMessages];

            if (isOurMessage) {
              // Look for optimistic message with similar content and timestamp to replace
              const optimisticIndex = prevMessages.findIndex(
                m =>
                  m.isOptimistic &&
                  m.content === message.content &&
                  m.sender_id === message.sender_id &&
                  Math.abs(
                    new Date(m.created_at).getTime() -
                      new Date(message.created_at).getTime()
                  ) < 10000 // Within 10 seconds
              );

              if (optimisticIndex !== -1) {
                // Replace optimistic message with real message, ensuring proper status progression
                const realMessage: ChatMessage = {
                  ...(message as ChatMessage),
                  isOptimistic: false,
                  status: 'sent', // Server confirmed message is sent
                };
                newMessages = [...prevMessages];
                newMessages[optimisticIndex] = realMessage;
                logger.debug(
                  'CHAT',
                  'Replaced optimistic message with real message (status: sent):',
                  message.id
                );
              } else {
                // Add as new message (couldn't find matching optimistic message)
                newMessages = [
                  ...prevMessages,
                  { ...(message as ChatMessage), isOptimistic: false },
                ];
              }
            } else {
              // Message from another user, just add it
              newMessages = [
                ...prevMessages,
                { ...(message as ChatMessage), isOptimistic: false },
              ];
            }

            // Add new message to cache
            messageCache.addMessageToCache(conversationId, message);

            // Update conversation preview in global state (defer to avoid render cycle conflicts)
            setTimeout(() => {
              updateConversationWithSort(conversationId, {
                last_message: message.content,
                last_message_at: message.created_at,
              });
            }, 0);

            // Smart scroll to show new message only if user is near bottom
            smartScrollToBottom(true);

            return newMessages;
          });

          // NOTE: Auto-delivery is now handled globally in ChatContext, not here
        }
      }
    );

    // Listen for typing indicators
    const unsubscribeTyping = socketService.onTyped<SocketTypingData>(
      'user_typing',
      (data: SocketTypingData) => {
        if (
          data.conversationId === conversationId &&
          user &&
          data.userId !== user.id
        ) {
          setTypingUsers(prevTyping => {
            if (data.isTyping) {
              return prevTyping.includes(data.userId)
                ? prevTyping
                : [...prevTyping, data.userId];
            } else {
              return prevTyping.filter(id => id !== data.userId);
            }
          });
        }
      }
    );

    // Listen for message delivery status
    const unsubscribeMessageDelivered =
      socketService.onTyped<SocketMessageStatusData>(
        'message_delivered',
        (data: SocketMessageStatusData) => {
          if (data.conversationId === conversationId) {
            logger.socket('Message delivered:', data.messageId);

            // Update message status in local state
            setMessages(prevMessages =>
              prevMessages.map(message =>
                message.id === data.messageId
                  ? {
                      ...message,
                      status: 'delivered',
                      delivered_at: data.deliveredAt,
                    }
                  : message
              )
            );
          }
        }
      );

    // Listen for message read status
    const unsubscribeMessageRead =
      socketService.onTyped<SocketMessageStatusData>(
        'message_read',
        (data: SocketMessageStatusData) => {
          if (data.conversationId === conversationId) {
            logger.socket('Message read:', data.messageId);

            // Update message status in local state
            setMessages(prevMessages =>
              prevMessages.map(message =>
                message.id === data.messageId
                  ? { ...message, status: 'read', read_at: data.readAt }
                  : message
              )
            );
          }
        }
      );

    // Listen for conversation read status (when all messages are marked as read)
    const unsubscribeConversationRead =
      socketService.onTyped<SocketConversationReadData>(
        'conversation_read',
        (data: SocketConversationReadData) => {
          if (data.conversationId === conversationId) {
            logger.socket(
              'Conversation read:',
              data.messageIds.length,
              'messages'
            );

            // Update all affected messages to read status
            setMessages(prevMessages =>
              prevMessages.map(message =>
                data.messageIds.includes(message.id)
                  ? { ...message, status: 'read', read_at: data.readAt }
                  : message
              )
            );
          }
        }
      );

    // Store unsubscribe functions locally for cleanup
    unsubscribersRef.current = [
      unsubscribeNewMessage,
      unsubscribeTyping,
      unsubscribeMessageDelivered,
      unsubscribeMessageRead,
      unsubscribeConversationRead,
    ];
  };

  // Clean up socket listeners
  const cleanupSocketListeners = (): void => {
    if (unsubscribersRef.current.length > 0) {
      unsubscribersRef.current.forEach((unsubscribe: () => void) => {
        try {
          unsubscribe();
        } catch (error) {
          logger.error('CHAT', 'Error unsubscribing from socket event:', error);
        }
      });
      unsubscribersRef.current = [];
    }
  };

  // Send a message
  const handleSendMessage = async (): Promise<void> => {
    const text = messageText.trim();
    if (!text || !user) return;

    // Create optimistic message with correlation ID
    const correlationId = generateCorrelationId();
    const optimisticMessage: ChatMessage = {
      id: `temp_${Date.now()}`, // Temporary ID
      content: text,
      sender_id: user.id,
      conversation_id: conversationId,
      message_type: 'text',
      created_at: new Date().toISOString(),
      status: 'sending', // Custom status for UI
      attachments: [],
      delivered_at: null,
      read_at: null,
      correlationId,
      isOptimistic: true,
    };

    // If still loading, queue the message; otherwise send immediately
    if (loading) {
      setQueuedMessages(prev => [...prev, optimisticMessage]);
      setMessageText('');
      return;
    }

    setSending(true);
    setMessageText('');

    // Add optimistic message to UI immediately, avoiding duplicates
    setMessages(prev => {
      const existingIds = new Set(prev.map(msg => msg.id));
      if (existingIds.has(optimisticMessage.id)) {
        logger.warn(
          'CHAT',
          'Optimistic message already exists, skipping:',
          optimisticMessage.id
        );
        return prev;
      }
      return [...prev, optimisticMessage];
    });

    // Always scroll for user's own messages (they expect to see what they sent)
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    // Stop typing indicator
    socketService.stopTyping(conversationId);

    try {
      logger.info('CHAT', 'Sending message:', text);

      await messageApiExports.sendMessage({
        conversationId,
        content: text,
        messageType: 'text',
      });

      logger.info('CHAT', 'Message sent successfully');

      // Note: Optimistic message will be automatically replaced by socket handler
      // when the real message arrives, so no need to manually remove it here
    } catch (error) {
      logger.error('CHAT', 'Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');

      // Mark message as failed
      setMessages(prev =>
        prev.map(msg =>
          msg.id === optimisticMessage.id ? { ...msg, status: 'failed' } : msg
        )
      );
    } finally {
      setSending(false);
    }
  };

  // Handle typing
  const handleTextChange = (text: string): void => {
    setMessageText(text);

    if (text.trim()) {
      // Start typing indicator
      socketService.startTyping(conversationId);

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        socketService.stopTyping(conversationId);
      }, 3000);
    } else {
      socketService.stopTyping(conversationId);
    }
  };

  // Format message time
  const formatMessageTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get message status icon - Instagram/Messenger style (minimal icons)
  const getMessageStatusIcon = (message: ChatMessage): React.ReactNode => {
    if (!user || message.sender_id !== user.id) return null; // Only show status for own messages

    // Only show status icons for failed messages and messages currently being sent
    // This moves away from WhatsApp-style per-message icons to Instagram/Messenger style
    switch (message.status) {
      case 'sending':
        // Clock icon - message being sent
        return (
          <Ionicons
            name="time-outline"
            size={14}
            color="rgba(255, 255, 255, 0.5)"
            style={styles.statusIcon}
          />
        );

      case 'failed':
        // Exclamation mark - message failed to send
        return (
          <Ionicons
            name="alert-circle"
            size={14}
            color="#ff6b6b"
            style={styles.statusIcon}
          />
        );

      default:
        // No individual message status icons for sent/delivered/read
        // This will be replaced by conversation-level "Seen" indicator
        return null;
    }
  };

  // Get conversation-level status - Instagram/Messenger style
  const getConversationStatus = (): { status: string; text: string } | null => {
    if (!user || messages.length === 0) return null;

    // Find the most recent message sent by the current user
    const myMessages = messages.filter(
      msg => msg.sender_id === user.id && !msg.isOptimistic
    );
    if (myMessages.length === 0) return null;

    const latestMessage = myMessages[myMessages.length - 1];

    switch (latestMessage.status) {
      case 'sent':
        return { status: 'sent', text: 'Sent' };
      case 'delivered':
        return { status: 'delivered', text: 'Delivered' };
      case 'read':
        return { status: 'read', text: 'Seen' };
      default:
        return null;
    }
  };

  // Render conversation status indicator
  const renderConversationStatus = (): React.ReactElement | null => {
    const status = getConversationStatus();
    if (!status) return null;

    return (
      <View style={styles.conversationStatusContainer}>
        <Text
          style={[
            styles.conversationStatusText,
            status.status === 'read' && styles.conversationStatusSeenText,
          ]}
        >
          {status.text}
        </Text>
      </View>
    );
  };

  // Render message item
  const renderMessage = ({
    item,
  }: {
    item: ChatMessage;
  }): React.ReactElement => {
    const isMyMessage = user && item.sender_id === user.id;

    return (
      <View
        style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessage : styles.otherMessage,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.otherMessageText,
            ]}
          >
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text
              style={[
                styles.messageTime,
                isMyMessage ? styles.myMessageTime : styles.otherMessageTime,
              ]}
            >
              {formatMessageTime(item.created_at)}
            </Text>
            {getMessageStatusIcon(item)}
          </View>
        </View>
      </View>
    );
  };

  // Render typing indicator with animated dots
  const renderTypingIndicator = (): React.ReactElement | null => {
    if (typingUsers.length === 0) return null;

    return (
      <Animated.View style={styles.typingContainer}>
        <View style={styles.typingBubble}>
          <View style={styles.typingDots}>
            <Animated.View
              style={[
                styles.typingDot,
                {
                  transform: [
                    {
                      translateY: dot1Anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -6],
                      }),
                    },
                  ],
                  opacity: dot1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.9],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.typingDot,
                {
                  transform: [
                    {
                      translateY: dot2Anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -6],
                      }),
                    },
                  ],
                  opacity: dot2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.9],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.typingDot,
                {
                  transform: [
                    {
                      translateY: dot3Anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -6],
                      }),
                    },
                  ],
                  opacity: dot3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 0.9],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderSkeletonMessages = (): React.ReactElement[] => {
    return Array.from({ length: 8 }).map((_, index) => (
      <View
        key={index}
        style={[
          styles.skeletonMessage,
          index % 2 === 0
            ? styles.skeletonMessageLeft
            : styles.skeletonMessageRight,
        ]}
      >
        <View style={styles.skeletonMessageBubble}>
          <View style={[styles.skeletonLine, { width: '80%' }]} />
          <View style={[styles.skeletonLine, { width: '60%', marginTop: 4 }]} />
        </View>
      </View>
    ));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <StatusBar style="light" />

      {/* Chat Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{conversationName || 'Chat'}</Text>
          {participants && participants.length > 0 && (
            <Text style={styles.headerSubtitle}>
              {participants.length} participant
              {participants.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="videocam" size={22} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="call" size={22} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.messagesList}>
          <View style={styles.messagesContainer}>
            {renderSkeletonMessages()}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={[...messages].reverse()} // Reverse for inverted display
          renderItem={renderMessage}
          keyExtractor={(item, index) => {
            // Use correlation ID for optimistic messages to ensure uniqueness
            if (item.isOptimistic && item.correlationId) {
              return `opt-${item.correlationId}`;
            }
            // Use message ID for real messages
            if (item.id) {
              return `msg-${item.id}`;
            }
            // Fallback for messages without ID (should rarely happen)
            return `unknown-${index}-${item.created_at}-${Math.random().toString(36).substr(2, 5)}`;
          }}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          inverted={true} // Show newest at bottom naturally
          ListHeaderComponent={renderTypingIndicator} // Typing dots appear at "top" of inverted list (bottom visually)
          ListFooterComponent={() =>
            loadingOlderMessages ? (
              <View style={styles.loadingOlderContainer}>
                <Text style={styles.loadingOlderText}>
                  Loading older messages...
                </Text>
              </View>
            ) : null
          }
          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } =
              event.nativeEvent;

            // With inverted FlatList, check if user scrolled near the end (older messages)
            const distanceFromEnd =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            const isNearOlderMessages = distanceFromEnd < 100;

            if (
              isNearOlderMessages &&
              hasMoreMessages &&
              !loadingOlderMessages
            ) {
              loadOlderMessages();
            }

            // With inverted list, near "bottom" (newest messages) is when scroll is near top
            const distanceFromBottom = contentOffset.y;
            isNearBottomRef.current = distanceFromBottom < 100;
          }}
          scrollEventThrottle={100}
          onLayout={() => {
            // Immediate scroll when FlatList first renders
            if (shouldScrollToBottomRef.current) {
              // Use multiple attempts to ensure scroll happens reliably (inverted list scrolls to top)
              const scrollToBottom = () => {
                flatListRef.current?.scrollToOffset({
                  offset: 0,
                  animated: false,
                });
                isNearBottomRef.current = true;
              };

              // Immediate attempt
              scrollToBottom();

              // Backup attempts for reliability
              setTimeout(scrollToBottom, 10);
              setTimeout(scrollToBottom, 50);
              setTimeout(() => {
                scrollToBottom();
                shouldScrollToBottomRef.current = false;
                logger.debug('CHAT', 'Completed scroll to bottom sequence');
              }, 100);
            }
          }}
          onContentSizeChange={() => {
            // Handle content size changes (new messages) with inverted list
            if (shouldScrollToBottomRef.current) {
              flatListRef.current?.scrollToOffset({
                offset: 0,
                animated: false,
              });
              isNearBottomRef.current = true;
            }
          }}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start the conversation!</Text>
            </View>
          )}
        />
      )}

      {/* Instagram/Messenger-style conversation status indicator */}
      {renderConversationStatus()}

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor="#8E8E93"
            value={messageText}
            onChangeText={handleTextChange}
            multiline
            maxLength={4000}
            editable={!sending}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              messageText.trim()
                ? styles.sendButtonActive
                : styles.sendButtonInactive,
            ]}
            onPress={handleSendMessage}
            disabled={!messageText.trim()}
            activeOpacity={0.7}
          >
            {messageText.trim() ? (
              <LinearGradient
                colors={['#4facfe', '#00f2fe']}
                style={styles.sendButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <Ionicons name="send" size={18} color="#8E8E93" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

// Wrap ChatScreen with ErrorBoundary for crash protection
const ChatScreenWithErrorBoundary: React.FC<ChatScreenProps> = props => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      logger.error('CHAT', 'ChatScreen crashed:', error, errorInfo);
    }}
  >
    <ChatScreen {...props} />
  </ErrorBoundary>
);

export default ChatScreenWithErrorBoundary;
