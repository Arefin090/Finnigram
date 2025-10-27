import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { userApiExports, messageApiExports } from '../services/api';
import { User, ConversationCreateData } from '../types';
import { useChat } from '../context/ChatContext';

interface UserSearchScreenProps {
  navigation: {
    navigate: (screen: string, params?: any) => void;
    goBack?: () => void;
  };
}

const UserSearchScreen: React.FC<UserSearchScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { loadConversations } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        handleSearch();
      } else {
        setSearchResults([]);
        setHasSearched(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      const response = await userApiExports.searchUsers(searchQuery.trim());
      // Filter out current user
      const filteredResults = response.data.users.filter(u => u.id !== user?.id);
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search users. Please try again.');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartConversation = async (selectedUser: User) => {
    if (creatingConversation) return;

    setCreatingConversation(true);

    try {
      console.log('🚀 Starting conversation with user:', selectedUser);

      // Create a direct conversation
      const conversationData: ConversationCreateData = {
        type: 'direct',
        participants: [selectedUser.id],
        name: undefined,
        description: undefined,
      };

      const response =
        await messageApiExports.createConversation(conversationData);
      const conversation = response.data.conversation;

      console.log('✅ Conversation created:', conversation);

      // Small delay to allow real-time sync
      setTimeout(async () => {
        // Refresh conversations list to ensure it appears
        await loadConversations();

        // Navigate to the new conversation
        navigation.navigate('Chat', {
          conversationId: conversation.id,
          conversationName: selectedUser.displayName || selectedUser.username,
          conversationType: 'direct',
        });
      }, 500);
    } catch (error) {
      console.error('❌ Start conversation error:', error);
      Alert.alert('Error', 'Failed to start conversation. Please try again.');
    } finally {
      setCreatingConversation(false);
    }
  };

  const getInitials = (name: string): string => {
    return name
      ? name
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'U';
  };

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleStartConversation(item)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={['#4facfe', '#00f2fe']}
        style={styles.avatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.avatarText}>
          {getInitials(item.displayName || item.username)}
        </Text>
      </LinearGradient>

      <View style={styles.userInfo}>
        <Text style={styles.displayName}>
          {item.displayName || item.username}
        </Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>

      {creatingConversation ? (
        <Text style={styles.loadingText}>Starting...</Text>
      ) : (
        <Ionicons name="add-circle-outline" size={24} color="#4facfe" />
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Searching...</Text>
        </View>
      );
    }

    if (hasSearched && searchResults.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color="#C7C7CC" />
          <Text style={styles.emptyTitle}>No users found</Text>
          <Text style={styles.emptySubtitle}>
            Try searching for a different username or email
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.emptyIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="people-outline" size={40} color="#fff" />
        </LinearGradient>
        <Text style={styles.emptyTitle}>Find People</Text>
        <Text style={styles.emptySubtitle}>
          Search for friends by username or email to start a conversation
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack?.()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Find People</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username or email..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={18} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      <FlatList
        data={searchResults}
        renderItem={renderUser}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          searchResults.length === 0 ? styles.emptyList : styles.listContent
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 40,
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
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#000000',
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },

  // List Styles
  listContent: {
    paddingTop: 8,
  },
  separator: {
    height: 0.5,
    backgroundColor: '#E5E5EA',
    marginLeft: 82,
  },

  // User Item Styles
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  username: {
    fontSize: 15,
    color: '#8E8E93',
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
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  loadingText: {
    fontSize: 14,
    color: '#4facfe',
    fontWeight: '500',
  },
});

export default UserSearchScreen;
