import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },

  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingTop: 16,
    paddingBottom: 8,
  },

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
    justifyContent: 'flex-end',
    marginTop: 6,
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
  statusIconContainer: {
    flexDirection: 'row',
    marginLeft: 4,
    alignItems: 'center',
  },
  statusIcon: {
    marginLeft: 2,
  },
  doubleCheck: {
    position: 'relative',
  },
  doubleCheckSecond: {
    marginLeft: -8,
  },

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
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
    marginHorizontal: 2,
  },

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
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    textAlignVertical: 'center',
    paddingTop: Platform.OS === 'ios' ? 8 : 0,
    paddingBottom: Platform.OS === 'ios' ? 8 : 0,
    marginRight: 8,
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

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#C7C7CC',
  },

  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
  },
  headerButton: {
    marginLeft: 16,
    padding: 4,
  },

  // Skeleton loading styles
  skeletonMessage: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  skeletonMessageLeft: {
    justifyContent: 'flex-start',
  },
  skeletonMessageRight: {
    justifyContent: 'flex-end',
  },
  skeletonMessageBubble: {
    backgroundColor: '#F2F2F7',
    borderRadius: 18,
    padding: 12,
    maxWidth: '75%',
    minWidth: 100,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#E5E5EA',
    borderRadius: 6,
  },

  // Loading older messages styles
  loadingOlderContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  loadingOlderText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },

  // Instagram/Messenger-style conversation status indicator
  conversationStatusContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  conversationStatusText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '400',
  },
  conversationStatusSeenText: {
    color: '#007AFF', // Blue color for "Seen" status like Instagram
  },
});
