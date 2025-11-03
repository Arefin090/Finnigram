import React, { forwardRef } from 'react';
import { View, Text, FlatList } from 'react-native';
import MessageItem from './MessageItem';
import { styles } from './MessageList.styles';

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

interface User {
  id: number;
  username?: string;
  displayName?: string;
}

interface MessageListProps {
  messages: ChatMessage[];
  user: User | null;
  loading: boolean;
  typingUsers: number[];
  onScroll: (event: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => void;
  onLayout: () => void;
  onContentSizeChange: () => void;
  renderSkeletonMessages: () => React.ReactNode;
  renderTypingIndicator: () => React.ReactNode;
}

export const MessageList = forwardRef<FlatList, MessageListProps>(
  (
    {
      messages,
      user,
      loading,
      typingUsers,
      onScroll,
      onLayout,
      onContentSizeChange,
      renderSkeletonMessages,
      renderTypingIndicator,
    },
    ref
  ) => {
    const renderMessage = ({
      item,
    }: {
      item: ChatMessage;
    }): React.ReactElement => {
      const isMyMessage = user && item.sender_id === user.id;
      return <MessageItem message={item} isMyMessage={!!isMyMessage} />;
    };

    const ListEmptyComponent = () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No messages yet</Text>
        <Text style={styles.emptySubtext}>Start the conversation!</Text>
      </View>
    );

    const ListFooterComponent = () => {
      return typingUsers.length > 0 ? <>{renderTypingIndicator()}</> : null;
    };

    if (loading) {
      return (
        <View style={styles.messagesList}>
          <View style={styles.messagesContainer}>
            {renderSkeletonMessages()}
          </View>
        </View>
      );
    }

    return (
      <FlatList
        ref={ref}
        data={[...messages].reverse()} // Reverse for inverted display
        renderItem={renderMessage}
        keyExtractor={(item, index) => {
          // Use correlation ID for optimistic messages to ensure uniqueness
          if (item.isOptimistic && item.correlationId) {
            return `opt-${item.correlationId}`;
          }
          // For regular messages, prefer actual ID but fallback to index if needed
          return item.id ? item.id.toString() : `msg-${index}`;
        }}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        inverted={true} // Show newest at bottom naturally
        ListHeaderComponent={ListFooterComponent} // Typing dots appear at "top" of inverted list (bottom visually)
        onScroll={onScroll}
        scrollEventThrottle={100}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        ListEmptyComponent={ListEmptyComponent}
      />
    );
  }
);

MessageList.displayName = 'MessageList';

export default MessageList;
