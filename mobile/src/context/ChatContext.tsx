import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  ReactNode,
} from 'react';
import { messageApiExports, type Conversation } from '../services/api';
import socketService from '../services/socket';
import { useAuth } from './AuthContext';
import logger from '../services/loggerConfig';

// Type definitions for Chat context
interface ChatState {
  loading: boolean;
  loadingMore: boolean;
  conversations: Conversation[];
  hasMore: boolean;
  currentOffset: number;
  error: string | null;
}

interface LoadingAction {
  type: 'LOADING';
}

interface LoadingMoreAction {
  type: 'LOADING_MORE';
}

interface SetConversationsAction {
  type: 'SET_CONVERSATIONS';
  payload: {
    conversations: Conversation[];
    hasMore: boolean;
  };
}

interface AppendConversationsAction {
  type: 'APPEND_CONVERSATIONS';
  payload: {
    conversations: Conversation[];
    hasMore: boolean;
  };
}

interface AddConversationAction {
  type: 'ADD_CONVERSATION';
  payload: Conversation;
}

interface UpdateConversationAction {
  type: 'UPDATE_CONVERSATION';
  payload: { id: number } & Partial<Conversation>;
}

interface UpdateConversationWithSortAction {
  type: 'UPDATE_CONVERSATION_WITH_SORT';
  payload: { id: number } & Partial<Conversation>;
}

interface ErrorAction {
  type: 'ERROR';
  payload: string;
}

interface ClearErrorAction {
  type: 'CLEAR_ERROR';
}

type ChatAction =
  | LoadingAction
  | LoadingMoreAction
  | SetConversationsAction
  | AppendConversationsAction
  | AddConversationAction
  | UpdateConversationAction
  | UpdateConversationWithSortAction
  | ErrorAction
  | ClearErrorAction;

interface SocketMessage {
  id: string | number;
  content: string;
  sender_id: number;
  conversation_id: number;
  message_type: string;
  created_at: string;
}

interface ChatContextType extends ChatState {
  loadConversations: (refresh?: boolean) => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  createConversation: (
    type: 'direct' | 'group',
    participants: number[],
    name?: string | null,
    description?: string | null
  ) => Promise<Conversation>;
  updateConversation: (
    conversationId: number,
    updates: Partial<Conversation>
  ) => void;
  updateConversationWithSort: (
    conversationId: number,
    updates: Partial<Conversation>
  ) => void;
  clearError: () => void;
}

interface ChatProviderProps {
  children: ReactNode;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Simple chat reducer - only manages conversations list and basic state
const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
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

    case 'ADD_CONVERSATION': {
      // Check if conversation already exists to avoid duplicates
      const existingConversation = state.conversations.find(
        c => c.id === action.payload.id
      );
      if (existingConversation) {
        return state; // Don't add duplicate
      }
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      };
    }

    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.id ? { ...conv, ...action.payload } : conv
        ),
      };

    case 'UPDATE_CONVERSATION_WITH_SORT': {
      const updatedConversations = state.conversations.map(conv =>
        conv.id === action.payload.id ? { ...conv, ...action.payload } : conv
      );

      // Sort by last_message_at (most recent first)
      updatedConversations.sort(
        (a, b) =>
          new Date(b.last_message_at || b.created_at).getTime() -
          new Date(a.last_message_at || a.created_at).getTime()
      );

      return {
        ...state,
        conversations: updatedConversations,
      };
    }

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

const initialState: ChatState = {
  loading: false,
  loadingMore: false,
  conversations: [],
  hasMore: true,
  currentOffset: 0,
  error: null,
};

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { isAuthenticated, user } = useAuth();

  // Set up minimal socket listeners - only for global conversation events
  useEffect(() => {
    logger.socket('ChatContext: Setting up socket listeners', {
      isAuthenticated,
      socketConnected: socketService.isConnected,
    });

    if (!isAuthenticated) {
      logger.socket('ChatContext: Skipping socket setup - not authenticated');
      return;
    }

    // Listen for new conversations (when someone starts a chat with you)
    const unsubscribeNewConversation = socketService.onTyped<Conversation>(
      'conversation_created',
      (conversation: Conversation) => {
        logger.socket('New conversation received via socket:', conversation.id);

        // Add conversation (reducer will handle duplicates)
        dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
      }
    );

    // Listen for new messages globally to update conversation previews
    const unsubscribeGlobalMessages = socketService.onTyped<SocketMessage>(
      'new_message',
      (message: SocketMessage) => {
        logger.socket(
          'ChatContext: Global message received for conversation:',
          message.conversation_id,
          'Content:',
          message.content
        );

        // Update the conversation preview and re-sort conversations by latest message
        updateConversationWithSort(message.conversation_id, {
          last_message: message.content,
          last_message_at: message.created_at,
        });

        // AUTO-DELIVERY: Mark message as delivered globally (even if not in the specific chat)
        if (message.sender_id !== user?.id) {
          setTimeout(async () => {
            try {
              await messageApiExports.markMessageAsDelivered(
                Number(message.id)
              );
              logger.info(
                'CHAT',
                'Global auto-marked message as delivered:',
                message.id
              );
            } catch (error) {
              logger.error(
                'CHAT',
                'Failed to globally auto-mark message as delivered:',
                error
              );
            }
          }, 100);
        }
      }
    );

    logger.socket('ChatContext: Socket listeners set up successfully');

    // Cleanup function
    return () => {
      logger.socket('ChatContext: Cleaning up socket listeners');
      unsubscribeNewConversation();
      unsubscribeGlobalMessages();
    };
  }, [isAuthenticated, user?.id]);

  // Load conversations list (initial load)
  const loadConversations = async (
    _refresh: boolean = false
  ): Promise<void> => {
    dispatch({ type: 'LOADING' });

    try {
      const response = await messageApiExports.getConversations(20, 0);
      const { conversations, hasMore } = response.data;

      dispatch({
        type: 'SET_CONVERSATIONS',
        payload: {
          conversations,
          hasMore: hasMore !== undefined ? hasMore : conversations.length >= 20,
        },
      });
    } catch (error) {
      logger.error('CHAT', 'Failed to load conversations:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load conversations' });
    }
  };

  // Load more conversations (pagination)
  const loadMoreConversations = async (): Promise<void> => {
    if (state.loadingMore || !state.hasMore) return;

    dispatch({ type: 'LOADING_MORE' });

    try {
      const response = await messageApiExports.getConversations(
        20,
        state.currentOffset
      );
      const { conversations, hasMore } = response.data;

      dispatch({
        type: 'APPEND_CONVERSATIONS',
        payload: {
          conversations,
          hasMore: hasMore !== undefined ? hasMore : conversations.length >= 20,
        },
      });
    } catch (error) {
      logger.error('CHAT', 'Failed to load more conversations:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load more conversations' });
    }
  };

  // Create a new conversation
  const createConversation = async (
    type: 'direct' | 'group',
    participants: number[],
    name: string | null = null,
    description: string | null = null
  ): Promise<Conversation> => {
    try {
      const response = await messageApiExports.createConversation({
        type,
        participantIds: participants,
        name: name || undefined,
        description: description || undefined,
      });

      const conversation = response.data.conversation;
      dispatch({ type: 'ADD_CONVERSATION', payload: conversation });

      return conversation;
    } catch (error) {
      logger.error('CHAT', 'Failed to create conversation:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to create conversation' });
      throw error;
    }
  };

  // Update conversation (for last message preview)
  const updateConversation = (
    conversationId: number,
    updates: Partial<Conversation>
  ): void => {
    dispatch({
      type: 'UPDATE_CONVERSATION',
      payload: { id: conversationId, ...updates },
    });
  };

  // Update conversation and re-sort by latest message
  const updateConversationWithSort = (
    conversationId: number,
    updates: Partial<Conversation>
  ): void => {
    dispatch({
      type: 'UPDATE_CONVERSATION_WITH_SORT',
      payload: { id: conversationId, ...updates },
    });
  };

  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value: ChatContextType = {
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

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
