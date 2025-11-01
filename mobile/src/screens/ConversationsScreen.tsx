import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';
import logger from '../services/loggerConfig';
import { type Conversation } from '../services/api';
import { styles } from './ConversationsScreen.styles';

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Types for navigation and props
interface Navigation {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
}

interface ConversationsScreenProps {
  navigation: Navigation;
}

// Types for conversation data - using API types
// Participant and Conversation interfaces imported from '../services/api'

// Types for render item
interface RenderItemProps {
  item: Conversation;
  index: number;
}

const ConversationsScreen: React.FC<ConversationsScreenProps> = ({
  navigation,
}) => {
  const { user } = useAuth();
  const {
    conversations,
    loading,
    loadingMore,
    hasMore,
    error,
    loadConversations,
    loadMoreConversations,
    clearError,
  } = useChat();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchVisible, setSearchVisible] = useState<boolean>(false);
  const searchAnimation = new Animated.Value(0);
  const fabAnimation = new Animated.Value(1);
  const contentOpacity = new Animated.Value(loading ? 0 : 1);
  const prevConversationsLength = useRef<number>(conversations.length);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      clearError();
    }
  }, [error]);

  // Animate when conversations list changes (new conversations added)
  useEffect(() => {
    if (conversations.length > prevConversationsLength.current) {
      // Configure smooth slide-in animation for new conversations
      LayoutAnimation.configureNext({
        duration: 300,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
      });
    }
    prevConversationsLength.current = conversations.length;
  }, [conversations]);

  // Animate content fade-in when loading completes
  useEffect(() => {
    if (!loading && conversations.length > 0) {
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (loading) {
      contentOpacity.setValue(0);
    }
  }, [loading, conversations.length]);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const handleLoadMore = (): void => {
    if (hasMore && !loadingMore && !loading) {
      loadMoreConversations();
    }
  };

  const formatLastSeen = (timestamp: string | undefined): string => {
    if (!timestamp) return '';

    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffMs = now.getTime() - messageTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return messageTime.toLocaleDateString();
  };

  const getConversationName = useCallback(
    (conversation: Conversation): string => {
      if (conversation.type === 'group') {
        return conversation.name || 'Group Chat';
      }

      // For direct messages, show the other user's name
      if (conversation.participants && conversation.participants.length > 0) {
        // Find the other participant (not the current user)
        const otherParticipant = conversation.participants.find(
          p =>
            user &&
            p.id !== user.id &&
            p.id !== (user as { user_id?: number }).user_id
        );

        if (otherParticipant) {
          // Try multiple field names for display name
          const displayName =
            otherParticipant.displayName ||
            otherParticipant.username ||
            'Unknown User';
          return displayName;
        }
      }

      // If participants are undefined, fall back
      if (conversation.participants === undefined) {
        return 'Loading...';
      }

      // Fallback to conversation name or generic message
      return conversation.name || 'Direct Message';
    },
    [user?.id]
  );

  const isUserOnline = (_conversation: Conversation): boolean => {
    // Simplified online check - would need participant user IDs in real app
    return false;
  };

  const getInitials = (name: string): string => {
    return name
      ? name
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'U';
  };

  const renderConversation = useCallback(
    ({ item }: RenderItemProps): React.ReactElement => (
      <Animated.View
        style={[
          styles.conversationWrapper,
          {
            opacity: 1,
            transform: [{ translateY: 0 }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.conversationItem}
          onPress={() =>
            navigation.navigate('Chat', {
              conversationId: item.id,
              conversationName: getConversationName(item),
              conversationType: item.type,
              participants: item.participants,
            })
          }
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={
                item.type === 'group'
                  ? ['#667eea', '#764ba2']
                  : ['#4facfe', '#00f2fe']
              }
              style={[styles.avatar, isUserOnline(item) && styles.onlineAvatar]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {item.type === 'group' ? (
                <Ionicons name="people" size={20} color="#fff" />
              ) : (
                <Text style={styles.avatarText}>
                  {getInitials(getConversationName(item))}
                </Text>
              )}
            </LinearGradient>
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
              <Text style={styles.lastMessage} numberOfLines={2}>
                {item.last_message || 'No messages yet'}
              </Text>
              {(item.unread_count || 0) > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadCount}>
                    {(item.unread_count || 0) > 99
                      ? '99+'
                      : item.unread_count || 0}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.conversationActions}>
            <Ionicons
              name="chevron-forward-outline"
              size={16}
              color="#C7C7CC"
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    ),
    [getConversationName, getInitials, isUserOnline, navigation]
  );

  const renderSkeletonItem = (index: number): React.ReactElement => (
    <View key={`skeleton-${index}`} style={styles.conversationWrapper}>
      <View style={styles.conversationItem}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, styles.skeletonAvatar]} />
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <View style={[styles.skeletonText, styles.skeletonName]} />
            <View style={[styles.skeletonText, styles.skeletonTimestamp]} />
          </View>

          <View style={styles.messagePreview}>
            <View style={[styles.skeletonText, styles.skeletonMessage]} />
          </View>
        </View>

        <View style={styles.conversationActions}>
          <View style={[styles.skeletonText, styles.skeletonChevron]} />
        </View>
      </View>
    </View>
  );

  const renderLoading = (): React.ReactElement => (
    <View>
      {Array.from({ length: 6 }, (_, index) => renderSkeletonItem(index))}
    </View>
  );

  const renderEmpty = (): React.ReactElement => (
    <View style={styles.emptyContainer}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.emptyIcon}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name="chatbubbles-outline" size={40} color="#fff" />
      </LinearGradient>
      <Text style={styles.emptyTitle}>Welcome to Finnigram</Text>
      <Text style={styles.emptySubtitle}>
        Start meaningful conversations with the people who matter most
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => {
          Alert.alert(
            'Coming Soon',
            'User search and conversation creation is coming soon!'
          );
        }}
      >
        <LinearGradient
          colors={['#4facfe', '#00f2fe']}
          style={styles.emptyButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.emptyButtonText}>Start a Conversation</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderLoadingFooter = (): React.ReactElement | null => {
    if (!loadingMore) return null;

    return (
      <View style={styles.loadingFooter}>
        <View style={styles.loadingDot} />
        <Text style={styles.loadingFooterText}>
          Loading more conversations...
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Finnigram</Text>
          <View style={styles.headerActions}>
            {loading && (
              <View style={styles.headerLoadingIndicator}>
                <View style={styles.loadingDot} />
              </View>
            )}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setSearchVisible(!searchVisible)}
            >
              <Ionicons name="search" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Search Bar */}
      {searchVisible && (
        <Animated.View
          style={[
            styles.searchContainer,
            {
              opacity: searchAnimation,
              transform: [
                {
                  translateY: searchAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#8E8E93" />
            <Text style={styles.searchPlaceholder}>
              Search conversations...
            </Text>
          </View>
        </Animated.View>
      )}

      <Animated.View
        style={[
          styles.listContainer,
          { opacity: loading ? 1 : contentOpacity },
        ]}
      >
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={item => item.id.toString()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#667eea"
              colors={['#667eea']}
            />
          }
          ListEmptyComponent={loading ? null : renderEmpty}
          ListHeaderComponent={loading ? renderLoading : null}
          ListFooterComponent={renderLoadingFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={
            !loading && conversations.length === 0
              ? styles.emptyList
              : styles.listContent
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.fabContainer,
          {
            transform: [{ scale: fabAnimation }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            Animated.sequence([
              Animated.timing(fabAnimation, {
                toValue: 0.9,
                duration: 100,
                useNativeDriver: true,
              }),
              Animated.timing(fabAnimation, {
                toValue: 1,
                duration: 100,
                useNativeDriver: true,
              }),
            ]).start();

            navigation.navigate('UserSearch');
          }}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4facfe', '#00f2fe']}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// Wrap ConversationsScreen with ErrorBoundary for crash protection
const ConversationsScreenWithErrorBoundary: React.FC<
  ConversationsScreenProps
> = props => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      logger.error('SCREEN', 'ConversationsScreen crashed:', error, errorInfo);
    }}
  >
    <ConversationsScreen {...props} />
  </ErrorBoundary>
);

export default ConversationsScreenWithErrorBoundary;
