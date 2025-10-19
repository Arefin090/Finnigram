import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { messageApiExports } from '../services/api';
import socketService from '../services/socket';
import { useAuth } from './AuthContext';

const ChatContext = createContext();

// Chat reducer
const chatReducer = (state, action) => {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null };
    
    case 'SET_CONVERSATIONS':
      return {
        ...state,
        loading: false,
        conversations: action.payload,
        error: null,
      };
    
    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      };
    
    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.id ? { ...conv, ...action.payload } : conv
        ),
      };
    
    case 'SET_MESSAGES':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: action.payload.messages,
        },
      };
    
    case 'ADD_MESSAGE':
      const { conversationId, message } = action.payload;
      return {
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [
            ...(state.messages[conversationId] || []),
            message,
          ],
        },
      };
    
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: state.messages[action.payload.conversationId]?.map(msg =>
            msg.id === action.payload.message.id ? action.payload.message : msg
          ) || [],
        },
      };
    
    case 'DELETE_MESSAGE':
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.payload.conversationId]: state.messages[action.payload.conversationId]?.filter(msg =>
            msg.id !== action.payload.messageId
          ) || [],
        },
      };
    
    case 'SET_TYPING_USERS':
      return {
        ...state,
        typingUsers: {
          ...state.typingUsers,
          [action.payload.conversationId]: action.payload.users,
        },
      };
    
    case 'SET_ONLINE_USERS':
      return { ...state, onlineUsers: action.payload };
    
    case 'UPDATE_USER_PRESENCE':
      const updatedOnlineUsers = action.payload.status === 'online'
        ? [...new Set([...state.onlineUsers, action.payload.userId])]
        : state.onlineUsers.filter(id => id !== action.payload.userId);
      
      return { ...state, onlineUsers: updatedOnlineUsers };
    
    case 'ERROR':
      return { ...state, loading: false, error: action.payload };
    
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    
    default:
      return state;
  }
};

const initialState = {
  loading: false,
  conversations: [],
  messages: {}, // { conversationId: [messages] }
  typingUsers: {}, // { conversationId: [userIds] }
  onlineUsers: [],
  currentConversation: null,
  error: null,
};

export const ChatProvider = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { isAuthenticated, user } = useAuth();

  // Set up socket listeners
  useEffect(() => {
    if (!isAuthenticated || !socketService.isConnected) return;

    // New message listener
    const unsubscribeNewMessage = socketService.on('new_message', (message) => {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { conversationId: message.conversation_id, message }
      });
      
      // Update conversation with latest message
      dispatch({
        type: 'UPDATE_CONVERSATION',
        payload: {
          id: message.conversation_id,
          last_message: message.content,
          last_message_at: message.created_at,
        }
      });
    });

    // Message updated listener
    const unsubscribeMessageUpdate = socketService.on('message_updated', (message) => {
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: { conversationId: message.conversation_id, message }
      });
    });

    // Message deleted listener
    const unsubscribeMessageDelete = socketService.on('message_deleted', (data) => {
      dispatch({
        type: 'DELETE_MESSAGE',
        payload: { conversationId: data.conversationId, messageId: data.messageId }
      });
    });

    // Typing indicators
    const unsubscribeTyping = socketService.on('user_typing', (data) => {
      const currentTyping = state.typingUsers[data.conversationId] || [];
      let updatedTyping;
      
      if (data.isTyping) {
        updatedTyping = [...new Set([...currentTyping, data.userId])];
      } else {
        updatedTyping = currentTyping.filter(id => id !== data.userId);
      }
      
      dispatch({
        type: 'SET_TYPING_USERS',
        payload: { conversationId: data.conversationId, users: updatedTyping }
      });
    });

    // Online users
    const unsubscribeOnlineUsers = socketService.on('online_users', (userIds) => {
      dispatch({ type: 'SET_ONLINE_USERS', payload: userIds });
    });

    // User presence updates
    const unsubscribePresence = socketService.on('user_presence_update', (data) => {
      dispatch({ type: 'UPDATE_USER_PRESENCE', payload: data });
    });

    // Cleanup function
    return () => {
      unsubscribeNewMessage();
      unsubscribeMessageUpdate();
      unsubscribeMessageDelete();
      unsubscribeTyping();
      unsubscribeOnlineUsers();
      unsubscribePresence();
    };
  }, [isAuthenticated, socketService.isConnected, state.typingUsers]);

  // Load conversations
  const loadConversations = async () => {
    dispatch({ type: 'LOADING' });
    
    try {
      const response = await messageApiExports.getConversations();
      dispatch({ type: 'SET_CONVERSATIONS', payload: response.data.conversations });
    } catch (error) {
      console.error('Failed to load conversations:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load conversations' });
    }
  };

  // Load messages for a conversation
  const loadMessages = async (conversationId, limit = 50, offset = 0) => {
    try {
      const response = await messageApiExports.getMessages(conversationId, limit, offset);
      dispatch({
        type: 'SET_MESSAGES',
        payload: { conversationId, messages: response.data.messages }
      });
      
      // Join socket room for this conversation
      socketService.joinConversation(conversationId);
      
      return response.data.messages;
    } catch (error) {
      console.error('Failed to load messages:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load messages' });
      return [];
    }
  };

  // Send a message
  const sendMessage = async (conversationId, content, messageType = 'text', replyTo = null) => {
    try {
      const response = await messageApiExports.sendMessage({
        conversationId,
        content,
        messageType,
        replyTo
      });
      
      // Message will be added via socket listener
      return response.data.data;
    } catch (error) {
      console.error('Failed to send message:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to send message' });
      throw error;
    }
  };

  // Create a new conversation
  const createConversation = async (type, participants, name = null, description = null) => {
    try {
      const response = await messageApiExports.createConversation({
        type,
        participants,
        name,
        description
      });
      
      const conversation = response.data.conversation;
      dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
      
      return conversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to create conversation' });
      throw error;
    }
  };

  // Start typing
  const startTyping = (conversationId) => {
    socketService.startTyping(conversationId);
  };

  // Stop typing
  const stopTyping = (conversationId) => {
    socketService.stopTyping(conversationId);
  };

  // Mark conversation as read
  const markAsRead = async (conversationId) => {
    try {
      await messageApiExports.markAsRead(conversationId);
      socketService.markAsRead(conversationId);
      
      // Update unread count locally
      dispatch({
        type: 'UPDATE_CONVERSATION',
        payload: { id: conversationId, unread_count: 0 }
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value = {
    ...state,
    loadConversations,
    loadMessages,
    sendMessage,
    createConversation,
    startTyping,
    stopTyping,
    markAsRead,
    clearError,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};