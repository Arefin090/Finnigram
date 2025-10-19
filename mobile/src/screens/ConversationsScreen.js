import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

const ConversationsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { 
    conversations, 
    loading, 
    error, 
    loadConversations, 
    onlineUsers,
    clearError 
  } = useChat();
  
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      clearError();
    }
  }, [error]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return '';
    
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffMs = now - messageTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return messageTime.toLocaleDateString();
  };

  const getConversationName = (conversation) => {
    if (conversation.type === 'group') {
      return conversation.name;
    }
    
    // For direct messages, show the other user's name
    // This is simplified - in a real app you'd fetch participant details
    return conversation.name || 'Direct Message';
  };

  const isUserOnline = (conversation) => {
    // Simplified online check - would need participant user IDs in real app
    return false;
  };

  const renderConversation = ({ item }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => navigation.navigate('Chat', {
        conversationId: item.id,
        conversationName: getConversationName(item),
        conversationType: item.type,
      })}
    >
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, isUserOnline(item) && styles.onlineAvatar]}>
          <Ionicons 
            name={item.type === 'group' ? 'people' : 'person'} 
            size={24} 
            color="#fff" 
          />
        </View>
        {isUserOnline(item) && <View style={styles.onlineIndicator} />}
      </View>
      
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {getConversationName(item)}
          </Text>
          <Text style={styles.timestamp}>
            {formatLastSeen(item.last_message_at)}
          </Text>
        </View>
        
        <View style={styles.messagePreview}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.last_message || 'No messages yet'}
          </Text>
          {item.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation with your friends
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={conversations.length === 0 ? styles.emptyList : null}
      />
      
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => Alert.alert('New Conversation', 'Coming soon! You will be able to start new conversations here.')}
      >
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    cursor: 'pointer',
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineAvatar: {
    borderWidth: 2,
    borderColor: '#34C759',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#fff',
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
  },
  messagePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    cursor: 'pointer',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default ConversationsScreen;