import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Animated,
  Platform,
  Dimensions,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

// Enable LayoutAnimation for Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ConversationsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const {
    conversations,
    loading,
    error,
    loadConversations,
    onlineUsers,
    clearError,
  } = useChat();

  const [refreshing, setRefreshing] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchAnimation = new Animated.Value(0);
  const fabAnimation = new Animated.Value(1);
  const contentOpacity = new Animated.Value(loading ? 0 : 1);
  const prevConversationsLength = useRef(conversations.length);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const formatLastSeen = timestamp => {
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

  const getConversationName = useCallback(
    conversation => {
      if (conversation.type === 'group') {
        return conversation.name || 'Group Chat';
      }

      // For direct messages, show the other user's name
      if (conversation.participants && conversation.participants.length > 0) {
        // Find the other participant (not the current user)
        const otherParticipant = conversation.participants.find(
          p => p.user_id !== user.id && p.user_id !== user.user_id
        );

        if (otherParticipant) {
          // Try multiple field names for display name
          const displayName =
            otherParticipant.display_name ||
            otherParticipant.displayName ||
            otherParticipant.username ||
            otherParticipant.name ||
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
    [user.id]
  );

  const isUserOnline = conversation => {
    // Simplified online check - would need participant user IDs in real app
    return false;
  };

  const getInitials = name => {
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
    ({ item, index }) => (
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
              {item.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadCount}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
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

  const renderSkeletonItem = index => (
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

  const renderLoading = () => (
    <View>
      {Array.from({ length: 6 }, (_, index) => renderSkeletonItem(index))}
    </View>
  );

  const renderEmpty = () => (
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
          console.log('Start conversation pressed');
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
            console.log('FAB clicked - navigating to user search');
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },

  // Header Styles
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
    paddingBottom: 20,
    paddingHorizontal: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLoadingIndicator: {
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },

  // Search Styles
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchPlaceholder: {
    marginLeft: 8,
    fontSize: 16,
    color: '#8E8E93',
  },

  // List Styles
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: 8,
  },
  separator: {
    height: 0.5,
    backgroundColor: '#E5E5EA',
    marginLeft: 82,
  },

  // Conversation Styles
  conversationWrapper: {
    backgroundColor: '#FFFFFF',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    cursor: 'pointer',
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  onlineAvatar: {
    borderWidth: 3,
    borderColor: '#34C759',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  conversationName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
    letterSpacing: -0.2,
  },
  timestamp: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  messagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 15,
    color: '#8E8E93',
    flex: 1,
    lineHeight: 20,
  },
  unreadBadge: {
    backgroundColor: '#4facfe',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  conversationActions: {
    marginLeft: 8,
    justifyContent: 'center',
  },

  // Skeleton Loading Styles
  skeletonAvatar: {
    backgroundColor: '#E1E5E9',
  },
  skeletonText: {
    backgroundColor: '#E1E5E9',
    borderRadius: 4,
  },
  skeletonName: {
    height: 16,
    width: '60%',
    marginBottom: 6,
  },
  skeletonTimestamp: {
    height: 14,
    width: 40,
  },
  skeletonMessage: {
    height: 14,
    width: '80%',
  },
  skeletonChevron: {
    height: 16,
    width: 16,
    borderRadius: 8,
  },

  // Empty State Styles
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },

  // FAB Styles
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    cursor: 'pointer',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ConversationsScreen;
