import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './MessageItem.styles';

// Types
interface ChatMessage {
  id: string | number;
  content: string;
  sender_id: number;
  conversation_id: number;
  message_type: string;
  created_at: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: unknown[];
  delivered_at?: string | null;
  read_at?: string | null;
  correlationId?: string;
  isOptimistic?: boolean;
}

interface MessageItemProps {
  message: ChatMessage;
  isMyMessage: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isMyMessage,
}) => {
  // Get message status icon
  const getMessageStatusIcon = (message: ChatMessage): React.ReactNode => {
    if (!isMyMessage) return null; // Only show status for own messages

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
        // Blue double checkmarks - message read by recipient
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

  // Format message time
  const formatMessageTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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
          {message.content}
        </Text>
        <View style={styles.messageFooter}>
          <Text
            style={[
              styles.messageTime,
              isMyMessage ? styles.myMessageTime : styles.otherMessageTime,
            ]}
          >
            {formatMessageTime(message.created_at)}
          </Text>
          {getMessageStatusIcon(message)}
        </View>
      </View>
    </View>
  );
};

export default MessageItem;
