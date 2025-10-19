import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

const ChatScreen = ({ route, navigation }) => {
  const { conversationId, conversationName } = route.params;
  const { user } = useAuth();
  const { 
    messages, 
    typingUsers, 
    loadMessages, 
    sendMessage, 
    startTyping, 
    stopTyping,
    markAsRead,
    error,
    clearError 
  } = useChat();

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const [inputHeight, setInputHeight] = useState(40);
  const sendButtonScale = useRef(new Animated.Value(1)).current;
  const messageAnimation = useRef(new Animated.Value(0)).current;

  const conversationMessages = messages[conversationId] || [];
  const typingUsersList = typingUsers[conversationId] || [];

  useEffect(() => {
    loadMessages(conversationId);
    markAsRead(conversationId);
    
    return () => {
      // Stop typing when leaving chat
      stopTyping(conversationId);
    };
  }, [conversationId]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
      clearError();
    }
  }, [error]);

  const handleTextChange = (text) => {
    setMessageText(text);
    
    if (text.trim()) {
      // Start typing indicator
      startTyping(conversationId);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Stop typing after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(conversationId);
      }, 3000);
    } else {
      stopTyping(conversationId);
    }
  };

  const handleSendMessage = async () => {
    const text = messageText.trim();
    if (!text) return;

    // Animate send button
    Animated.sequence([
      Animated.timing(sendButtonScale, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(sendButtonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setSending(true);
    setMessageText('');
    
    // Stop typing indicator
    stopTyping(conversationId);
    
    try {
      await sendMessage(conversationId, text);
      
      // Animate new message
      Animated.timing(messageAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
      setMessageText(text); // Restore message
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateHeader = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    return date.toLocaleDateString();
  };

  const shouldShowDateHeader = (currentMessage, previousMessage) => {
    if (!previousMessage) return true;
    
    const currentDate = new Date(currentMessage.created_at).toDateString();
    const previousDate = new Date(previousMessage.created_at).toDateString();
    
    return currentDate !== previousDate;
  };

  const renderMessage = ({ item, index }) => {
    const isMyMessage = item.sender_id === user.id;
    const previousMessage = index > 0 ? conversationMessages[index - 1] : null;
    const showDateHeader = shouldShowDateHeader(item, previousMessage);
    const isLastMessage = index === conversationMessages.length - 1;

    return (
      <Animated.View style={{
        opacity: isLastMessage ? messageAnimation : 1,
        transform: [{
          translateY: isLastMessage ? messageAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }) : 0
        }]
      }}>
        {showDateHeader && (
          <View style={styles.dateHeader}>
            <View style={styles.dateHeaderBubble}>
              <Text style={styles.dateHeaderText}>
                {formatDateHeader(item.created_at)}
              </Text>
            </View>
          </View>
        )}
        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessage : styles.otherMessage
        ]}>
          <View style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble
          ]}>
            <Text style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.otherMessageText
            ]}>
              {item.content}
            </Text>
            <View style={styles.messageFooter}>
              <Text style={[
                styles.messageTime,
                isMyMessage ? styles.myMessageTime : styles.otherMessageTime
              ]}>
                {formatMessageTime(item.created_at)}
                {item.edited_at && ' (edited)'}
              </Text>
              {isMyMessage && (
                <Ionicons 
                  name="checkmark-done" 
                  size={14} 
                  color="rgba(255, 255, 255, 0.7)" 
                  style={styles.messageStatus}
                />
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderTypingIndicator = () => {
    if (typingUsersList.length === 0) return null;

    return (
      <Animated.View style={styles.typingContainer}>
        <View style={styles.typingBubble}>
          <View style={styles.typingDots}>
            <View style={[styles.typingDot, styles.typingDot1]} />
            <View style={[styles.typingDot, styles.typingDot2]} />
            <View style={[styles.typingDot, styles.typingDot3]} />
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <StatusBar style="light" />
      
      <FlatList
        ref={flatListRef}
        data={conversationMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        inverted={false}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        ListFooterComponent={renderTypingIndicator}
      />

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TouchableOpacity style={styles.attachButton}>
            <Ionicons name="add" size={24} color="#8E8E93" />
          </TouchableOpacity>
          
          <View style={[styles.textInputContainer, { minHeight: Math.max(40, inputHeight) }]}>
            <TextInput
              style={[styles.textInput, { height: Math.max(40, inputHeight) }]}
              placeholder="Message..."
              placeholderTextColor="#8E8E93"
              value={messageText}
              onChangeText={handleTextChange}
              onContentSizeChange={(event) => {
                setInputHeight(Math.min(120, Math.max(40, event.nativeEvent.contentSize.height)));
              }}
              multiline
              maxLength={4000}
              editable={!sending}
              blurOnSubmit={false}
            />
          </View>

          <Animated.View style={[
            styles.sendButtonContainer,
            { transform: [{ scale: sendButtonScale }] }
          ]}>
            <TouchableOpacity
              style={[
                styles.sendButton,
                messageText.trim() && !sending ? styles.sendButtonActive : styles.sendButtonInactive
              ]}
              onPress={handleSendMessage}
              disabled={!messageText.trim() || sending}
              activeOpacity={0.7}
            >
              {messageText.trim() && !sending ? (
                <LinearGradient
                  colors={['#4facfe', '#00f2fe']}
                  style={styles.sendButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <Ionicons 
                  name={sending ? 'hourglass' : 'send'} 
                  size={18} 
                  color="#8E8E93" 
                />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  
  // Message List Styles
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Date Header Styles
  dateHeader: {
    alignItems: 'center',
    marginVertical: 20,
  },
  dateHeaderBubble: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  dateHeaderText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },

  // Message Styles
  messageContainer: {
    marginHorizontal: 16,
    marginVertical: 3,
  },
  myMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: width * 0.75,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  myMessageBubble: {
    backgroundColor: '#4facfe',
    borderBottomRightRadius: 8,
  },
  otherMessageBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#000000',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    justifyContent: 'flex-end',
  },
  messageTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  myMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  otherMessageTime: {
    color: '#8E8E93',
  },
  messageStatus: {
    marginLeft: 4,
  },

  // Typing Indicator Styles
  typingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  typingBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderBottomLeftRadius: 8,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
    marginHorizontal: 2,
  },
  typingDot1: {
    opacity: 0.4,
  },
  typingDot2: {
    opacity: 0.7,
  },
  typingDot3: {
    opacity: 1,
  },

  // Input Container Styles
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F2F2F7',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 48,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  textInputContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  textInput: {
    fontSize: 16,
    color: '#000000',
    textAlignVertical: 'center',
    paddingTop: Platform.OS === 'ios' ? 8 : 0,
    paddingBottom: Platform.OS === 'ios' ? 8 : 0,
  },
  sendButtonContainer: {
    marginLeft: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  sendButtonActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#4facfe',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  sendButtonInactive: {
    backgroundColor: 'transparent',
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ChatScreen;