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

// Interface for socket service with unsubscribers
interface SocketServiceWithUnsubscribers {
  isConnected: boolean;
  joinConversation: (conversationId: number) => void;
  leaveConversation: (conversationId: number) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => () => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  startTyping: (conversationId: number) => void;
  stopTyping: (conversationId: number) => void;
  _currentUnsubscribers?: (() => void)[] | null;
}

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

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values for typing dots
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  // Start typing animation when users are typing
  useEffect(() => {
    if (typingUsers.length > 0) {
      startTypingAnimation();
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

  // Load messages when component mounts
  useEffect(() => {
    console.log('💬 ChatScreen mounted for conversation:', conversationId);
    loadMessages();
    joinConversation();

    // Listen for socket connection and join room when ready
    const handleSocketConnect = () => {
      console.log('🔗 Socket connected, joining conversation room');
      joinConversation();
    };

    socketService.on('connect', handleSocketConnect);

    // AUTO-READ: Mark conversation as read when user opens it
    setTimeout(async () => {
      try {
        await messageApiExports.markAsRead(conversationId);
        console.log('✅ Auto-marked conversation as read:', conversationId);
      } catch (error) {
        console.error('❌ Failed to auto-mark conversation as read:', error);
      }
    }, 500); // Small delay to ensure messages are loaded first

    return () => {
      socketService.off('connect', handleSocketConnect);
      leaveConversation();
    };
  }, [conversationId]);

  // Load messages with cache-first strategy
  const loadMessages = async (): Promise<void> => {
    setLoading(true);

    try {
      // 1. Try to load from cache first for instant display
      console.log('📦 Checking cache for conversation:', conversationId);
      const cachedMessages =
        await messageCache.getCachedMessages(conversationId);

      if (cachedMessages && cachedMessages.length > 0) {
        console.log('⚡ Loaded', cachedMessages.length, 'messages from cache');
        setMessages(cachedMessages as ChatMessage[]);
        setLoading(false); // Stop loading immediately with cached data

        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 100);
      }

      // 2. Fetch fresh data from API in background
      console.log(
        '📥 Loading fresh messages from API for conversation:',
        conversationId
      );
      const response = await messageApiExports.getMessages(conversationId);
      const freshMessages = response.data.messages || [];

      // 3. Conflict resolution: Compare cached vs fresh data
      if (cachedMessages && cachedMessages.length > 0) {
        // Check for conflicts (messages that changed or were deleted)
        const hasConflicts =
          cachedMessages.length !== freshMessages.length ||
          !cachedMessages.every(cachedMsg => {
            const freshMsg = freshMessages.find(m => m.id === cachedMsg.id);
            return (
              freshMsg && JSON.stringify(cachedMsg) === JSON.stringify(freshMsg)
            );
          });

        if (hasConflicts) {
          console.log('⚠️ Cache conflicts detected, refreshing from API');
          await messageCache.refreshCacheFromAPI(conversationId, freshMessages);
        } else {
          console.log('✅ Cache is up to date');
          await messageCache.cacheMessages(conversationId, freshMessages);
        }
      } else {
        await messageCache.cacheMessages(conversationId, freshMessages);
      }

      setMessages(freshMessages as ChatMessage[]);
      console.log(
        '✅ Loaded',
        freshMessages.length,
        'fresh messages from API and resolved conflicts'
      );

      // Scroll to bottom after fresh data loads
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (error) {
      console.error('❌ Failed to load messages:', error);
      Alert.alert('Error', 'Failed to load messages');
    } finally {
      setLoading(false);

      // Process queued messages after loading completes
      if (queuedMessages.length > 0) {
        console.log('📤 Processing', queuedMessages.length, 'queued messages');

        // Add queued messages to UI
        setMessages(prev => [...queuedMessages, ...prev]);

        // Send each queued message
        queuedMessages.forEach(async queuedMsg => {
          try {
            await messageApiExports.sendMessage({
              conversationId: queuedMsg.conversation_id,
              content: queuedMsg.content,
              messageType: queuedMsg.message_type,
            });

            // Remove optimistic message - socket will add the real one
            setMessages(prev => prev.filter(msg => msg.id !== queuedMsg.id));
          } catch (error) {
            console.error('❌ Failed to send queued message:', error);
            setMessages(prev =>
              prev.map(msg =>
                msg.id === queuedMsg.id ? { ...msg, status: 'failed' } : msg
              )
            );
          }
        });

        // Clear the queue
        setQueuedMessages([]);
      }
    }
  };

  // Join conversation socket room
  const joinConversation = (): void => {
    if (socketService.isConnected) {
      console.log('🔗 Joining socket room for conversation:', conversationId);
      socketService.joinConversation(conversationId);

      // Set up socket listeners for this conversation
      setupSocketListeners();
    } else {
      console.log('⏳ Socket not connected yet, will join when ready');
    }
  };

  // Leave conversation socket room
  const leaveConversation = (): void => {
    if (socketService.isConnected) {
      console.log('🚪 Leaving socket room for conversation:', conversationId);
      socketService.leaveConversation(conversationId);

      // Clean up socket listeners
      cleanupSocketListeners();
    }
  };

  // Set up socket event listeners
  const setupSocketListeners = (): void => {
    // Listen for new messages
    const unsubscribeNewMessage = socketService.on(
      'new_message',
      (message: SocketMessage) => {
        if (message.conversation_id === conversationId) {
          console.log('📨 Received new message via socket:', message.id);

          // Add message to local state
          setMessages(prevMessages => {
            // Check if message already exists to prevent duplicates
            const messageExists = prevMessages.some(m => m.id === message.id);
            if (messageExists) {
              console.log('⚠️ Message already exists, skipping:', message.id);
              return prevMessages;
            }

            // Add new message to cache
            messageCache.addMessageToCache(conversationId, message);

            const newMessages = [...prevMessages, message as ChatMessage];

            // Update conversation preview in global state (defer to avoid render cycle conflicts)
            setTimeout(() => {
              updateConversationWithSort(conversationId, {
                last_message: message.content,
                last_message_at: message.created_at,
              });
            }, 0);

            // Scroll to bottom
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);

            return newMessages;
          });

          // NOTE: Auto-delivery is now handled globally in ChatContext, not here
        }
      }
    );

    // Listen for typing indicators
    const unsubscribeTyping = socketService.on(
      'user_typing',
      (data: SocketTypingData) => {
        if (data.conversationId === conversationId && data.userId !== user.id) {
          setTypingUsers(prevTyping => {
            if (data.isTyping) {
              return [...new Set([...prevTyping, data.userId])];
            } else {
              return prevTyping.filter(id => id !== data.userId);
            }
          });
        }
      }
    );

    // Listen for message delivery status
    const unsubscribeMessageDelivered = socketService.on(
      'message_delivered',
      (data: SocketMessageStatusData) => {
        if (data.conversationId === conversationId) {
          console.log('📬 Message delivered:', data.messageId);

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
    const unsubscribeMessageRead = socketService.on(
      'message_read',
      (data: SocketMessageStatusData) => {
        if (data.conversationId === conversationId) {
          console.log('👁️ Message read:', data.messageId);

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
    const unsubscribeConversationRead = socketService.on(
      'conversation_read',
      (data: SocketConversationReadData) => {
        if (data.conversationId === conversationId) {
          console.log(
            '👁️ Conversation read:',
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

    // Store unsubscribe functions for cleanup
    (socketService as SocketServiceWithUnsubscribers)._currentUnsubscribers = [
      unsubscribeNewMessage,
      unsubscribeTyping,
      unsubscribeMessageDelivered,
      unsubscribeMessageRead,
      unsubscribeConversationRead,
    ];
  };

  // Clean up socket listeners
  const cleanupSocketListeners = (): void => {
    const socketWithUnsubscribers = socketService as SocketServiceWithUnsubscribers;
    if (socketWithUnsubscribers._currentUnsubscribers) {
      socketWithUnsubscribers._currentUnsubscribers.forEach(
        (unsubscribe: () => void) => unsubscribe()
      );
      socketWithUnsubscribers._currentUnsubscribers = null;
    }
  };

  // Send a message
  const handleSendMessage = async (): Promise<void> => {
    const text = messageText.trim();
    if (!text) return;

    // Create optimistic message
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
    };

    // If still loading, queue the message; otherwise send immediately
    if (loading) {
      setQueuedMessages(prev => [...prev, optimisticMessage]);
      setMessageText('');
      return;
    }

    setSending(true);
    setMessageText('');

    // Add optimistic message to UI immediately
    setMessages(prev => [optimisticMessage, ...prev]);

    // Stop typing indicator
    socketService.stopTyping(conversationId);

    try {
      console.log('🚀 Sending message:', text);

      await messageApiExports.sendMessage({
        conversationId,
        content: text,
        messageType: 'text',
      });

      console.log('✅ Message sent successfully');

      // Remove optimistic message - socket will add the real one
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
    } catch (error) {
      console.error('❌ Failed to send message:', error);
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

  // Get message status icon
  const getMessageStatusIcon = (message: ChatMessage): React.ReactNode => {
    if (message.sender_id !== user.id) return null; // Only show status for own messages

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

      case 'sent':
        // Single gray checkmark - message sent to server
        return (
          <Ionicons
            name="checkmark"
            size={14}
            color="rgba(255, 255, 255, 0.6)"
            style={styles.statusIcon}
          />
        );

      case 'delivered':
        // Double gray checkmarks - message delivered to recipient's device
        return (
          <View style={styles.statusIconContainer}>
            <Ionicons
              name="checkmark"
              size={14}
              color="rgba(255, 255, 255, 0.8)"
              style={[styles.statusIcon, styles.doubleCheck]}
            />
            <Ionicons
              name="checkmark"
              size={14}
              color="rgba(255, 255, 255, 0.8)"
              style={[styles.statusIcon, styles.doubleCheckSecond]}
            />
          </View>
        );

      case 'read':
        // Blue double checkmarks - message read by recipient (like WhatsApp)
        return (
          <View style={styles.statusIconContainer}>
            <Ionicons
              name="checkmark"
              size={14}
              color="#4facfe"
              style={[styles.statusIcon, styles.doubleCheck]}
            />
            <Ionicons
              name="checkmark"
              size={14}
              color="#4facfe"
              style={[styles.statusIcon, styles.doubleCheckSecond]}
            />
          </View>
        );

      default:
        return null;
    }
  };

  // Render message item
  const renderMessage = ({
    item,
  }: {
    item: ChatMessage;
  }): React.ReactElement => {
    const isMyMessage = item.sender_id === user.id;

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
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item =>
            item.id ? item.id.toString() : `unknown-${Math.random()}`
          }
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          ListFooterComponent={renderTypingIndicator}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start the conversation!</Text>
            </View>
          )}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        />
      )}

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

export default ChatScreen;
