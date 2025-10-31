import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { messageApiExports } from '../services/api';
import socketService from '../services/socket';
import { useAuth } from './AuthContext';

const ChatContext = createContext();

// Simple chat reducer - only manages conversations list and basic state
const chatReducer = (state, action) => {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null };

    case 'LOADING_MORE':
      return { ...state, loadingMore: true, error: null };

    case 'SET_CONVERSATIONS':
      return {
        ...state,
        loading: false,
        conversations: action.payload.conversations,
        hasMore: action.payload.hasMore,
        currentOffset: action.payload.conversations.length,
        error: null,
      };

    case 'APPEND_CONVERSATIONS':
      return {
        ...state,
        loadingMore: false,
        conversations: [
          ...state.conversations,
          ...action.payload.conversations,
        ],
        hasMore: action.payload.hasMore,
        currentOffset:
          state.currentOffset + action.payload.conversations.length,
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

    case 'UPDATE_CONVERSATION_WITH_SORT':
      const updatedConversations = state.conversations.map(conv =>
        conv.id === action.payload.id ? { ...conv, ...action.payload } : conv
      );

      // Sort by last_message_at (most recent first)
      updatedConversations.sort(
        (a, b) =>
          new Date(b.last_message_at || b.created_at) -
          new Date(a.last_message_at || a.created_at)
      );

      return {
        ...state,
        conversations: updatedConversations,
      };

    case 'ERROR':
      return {
        ...state,
        loading: false,
        loadingMore: false,
        error: action.payload,
      };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
};

const initialState = {
  loading: false,
  loadingMore: false,
  conversations: [],
  hasMore: true,
  currentOffset: 0,
  error: null,
};

export const ChatProvider = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { isAuthenticated, user } = useAuth();

  // Set up minimal socket listeners - only for global conversation events
  useEffect(() => {
    if (!isAuthenticated || !socketService.isConnected) return;

    // Listen for new conversations (when someone starts a chat with you)
    const unsubscribeNewConversation = socketService.on(
      'conversation_created',
      conversation => {
        console.log(
          '🆕 New conversation received via socket:',
          conversation.id
        );

        // Check if conversation already exists to avoid duplicates
        const existingConversation = state.conversations.find(
          c => c.id === conversation.id
        );
        if (!existingConversation) {
          dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
        }
      }
    );

    // Listen for new messages globally to update conversation previews
    const unsubscribeGlobalMessages = socketService.on(
      'new_message',
      message => {
        console.log(
          '📨 Global message received for conversation:',
          message.conversation_id
        );

        // Update the conversation preview and re-sort conversations by latest message
        updateConversationWithSort(message.conversation_id, {
          last_message: message.content,
          last_message_at: message.created_at,
        });

        // AUTO-DELIVERY: Mark message as delivered globally (even if not in the specific chat)
        if (message.sender_id !== user.id) {
          setTimeout(async () => {
            try {
              const { messageApiExports } = require('../services/api');
              await messageApiExports.markMessageAsDelivered(message.id);
              console.log(
                '✅ Global auto-marked message as delivered:',
                message.id
              );
            } catch (error) {
              console.error(
                '❌ Failed to globally auto-mark message as delivered:',
                error
              );
            }
          }, 100);
        }
      }
    );

    // Cleanup function
    return () => {
      unsubscribeNewConversation();
      unsubscribeGlobalMessages();
    };
  }, [isAuthenticated, socketService.isConnected, state.conversations]);

  // Load conversations list (initial load)
  const loadConversations = async (refresh = false) => {
    dispatch({ type: 'LOADING' });

    try {
      const response = await messageApiExports.getConversations(20, 0);
      const { conversations, total, hasMore } = response.data;

      dispatch({
        type: 'SET_CONVERSATIONS',
        payload: {
          conversations,
          hasMore: hasMore !== undefined ? hasMore : conversations.length >= 20,
        },
      });
    } catch (error) {
      console.error('Failed to load conversations:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load conversations' });
    }
  };

  // Load more conversations (pagination)
  const loadMoreConversations = async () => {
    if (state.loadingMore || !state.hasMore) return;

    dispatch({ type: 'LOADING_MORE' });

    try {
      const response = await messageApiExports.getConversations(
        20,
        state.currentOffset
      );
      const { conversations, total, hasMore } = response.data;

      dispatch({
        type: 'APPEND_CONVERSATIONS',
        payload: {
          conversations,
          hasMore: hasMore !== undefined ? hasMore : conversations.length >= 20,
        },
      });
    } catch (error) {
      console.error('Failed to load more conversations:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load more conversations' });
    }
  };

  // Create a new conversation
  const createConversation = async (
    type,
    participants,
    name = null,
    description = null
  ) => {
    try {
      const response = await messageApiExports.createConversation({
        type,
        participants,
        name,
        description,
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

  // Update conversation (for last message preview)
  const updateConversation = (conversationId, updates) => {
    dispatch({
      type: 'UPDATE_CONVERSATION',
      payload: { id: conversationId, ...updates },
    });
  };

  // Update conversation and re-sort by latest message
  const updateConversationWithSort = (conversationId, updates) => {
    dispatch({
      type: 'UPDATE_CONVERSATION_WITH_SORT',
      payload: { id: conversationId, ...updates },
    });
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value = {
    ...state,
    loadConversations,
    loadMoreConversations,
    createConversation,
    updateConversation,
    updateConversationWithSort,
    clearError,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
