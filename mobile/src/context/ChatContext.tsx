import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  ReactNode,
} from 'react';
import { messageApiExports } from '../services/api';
import socketService from '../services/socket';
import { ChatState, Conversation, ConversationCreateData } from '../types';
import { useAuth } from './AuthContext';

interface ChatContextType {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  loadConversations: () => Promise<void>;
  createConversation: (
    type: 'direct' | 'group',
    participants: number[],
    name?: string,
    description?: string
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

const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Simple chat reducer - only manages conversations list and basic state
type ChatAction =
  | { type: 'LOADING' }
  | { type: 'SET_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | {
      type: 'UPDATE_CONVERSATION';
      payload: { id: number } & Partial<Conversation>;
    }
  | {
      type: 'UPDATE_CONVERSATION_WITH_SORT';
      payload: { id: number } & Partial<Conversation>;
    }
  | { type: 'ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' };

const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
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
        conversations: [...state.conversations, action.payload],
        error: null,
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
      const sortedConversations = updatedConversations.sort((a, b) => {
        const aTime = new Date(a.last_message_at || a.created_at).getTime();
        const bTime = new Date(b.last_message_at || b.created_at).getTime();
        return bTime - aTime;
      });

      return {
        ...state,
        conversations: sortedConversations,
      };

    case 'ERROR':
      return { ...state, loading: false, error: action.payload };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
};

const initialState: ChatState = {
  loading: false,
  conversations: [],
  error: null,
};

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { isAuthenticated, user } = useAuth();

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

  // Set up minimal socket listeners - only for global conversation events
  useEffect(() => {
    if (!isAuthenticated || !socketService.isConnected) return;

    // Listen for new conversations (when someone starts a chat with you)
    const unsubscribeNewConversation = socketService.on(
      'conversation_created',
      (conversation: Conversation) => {
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
      (message: {
        conversation_id: number;
        content: string;
        created_at: string;
        sender_id: number;
        id: number;
      }) => {
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
        if (message.sender_id !== user?.id) {
          setTimeout(async () => {
            try {
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
          }, 500);
        }
      }
    );

    // Cleanup function
    return () => {
      unsubscribeNewConversation();
      unsubscribeGlobalMessages();
    };
  }, [isAuthenticated, user?.id, state.conversations]);

  // Load conversations list
  const loadConversations = async (): Promise<void> => {
    dispatch({ type: 'LOADING' });

    try {
      const response = await messageApiExports.getConversations();
      dispatch({
        type: 'SET_CONVERSATIONS',
        payload: response.data.conversations,
      });
    } catch (error) {
      console.error('Failed to load conversations:', error);
      dispatch({ type: 'ERROR', payload: 'Failed to load conversations' });
    }
  };

  // Create a new conversation
  const createConversation = async (
    type: 'direct' | 'group',
    participants: number[],
    name?: string,
    description?: string
  ): Promise<Conversation> => {
    try {
      const conversationData: ConversationCreateData = {
        type,
        participants,
        name,
        description,
      };

      const response =
        await messageApiExports.createConversation(conversationData);
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
  const updateConversation = (
    conversationId: number,
    updates: Partial<Conversation>
  ): void => {
    dispatch({
      type: 'UPDATE_CONVERSATION',
      payload: { id: conversationId, ...updates },
    });
  };

  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value: ChatContextType = {
    ...state,
    loadConversations,
    createConversation,
    updateConversation,
    updateConversationWithSort,
    clearError,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatContext');
  }
  return context;
};
