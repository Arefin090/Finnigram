import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { defaultTheme, getThemeForRelationship } from '../themes';

// Type definitions for Theme system
interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

interface Theme {
  name: string;
  colors: {
    [key: string]: string | string[];
  };
  gradients: {
    [key: string]: string[];
  };
  shadows: {
    [key: string]: ShadowStyle;
  };
  animations?: {
    [key: string]: boolean | Record<string, unknown>;
  };
}

interface ConversationThemes {
  [conversationId: number]: Theme;
}

interface ThemeContextType {
  // Current theme
  theme: Theme;

  // Theme management
  setAppTheme: (theme: Theme) => void;
  setConversationTheme: (
    conversationId: number,
    relationshipType: string
  ) => void;
  getConversationTheme: (conversationId: number) => Theme;
  removeConversationTheme: (conversationId: number) => void;

  // Helper functions
  getGradient: (
    gradientName?: string,
    conversationId?: number | null
  ) => string[];
  getShadow: (
    shadowSize?: string,
    conversationId?: number | null
  ) => ShadowStyle;
  hasAnimation: (
    animationType: string,
    conversationId: number
  ) => boolean | Record<string, unknown> | undefined;

  // Conversation themes map
  conversationThemes: ConversationThemes;
}

interface ThemeProviderProps {
  children: ReactNode;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);
  const [conversationThemes, setConversationThemes] =
    useState<ConversationThemes>({});

  // Set theme for the entire app
  const setAppTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
  }, []);

  // Set theme for a specific conversation
  const setConversationTheme = useCallback(
    (conversationId: number, relationshipType: string) => {
      const theme = getThemeForRelationship(relationshipType);
      setConversationThemes(prev => ({
        ...prev,
        [conversationId]: theme,
      }));
    },
    []
  );

  // Get theme for a specific conversation
  const getConversationTheme = useCallback(
    (conversationId: number): Theme => {
      return conversationThemes[conversationId] || currentTheme;
    },
    [conversationThemes, currentTheme]
  );

  // Remove theme for a conversation
  const removeConversationTheme = useCallback((conversationId: number) => {
    setConversationThemes(prev => {
      const newThemes = { ...prev };
      delete newThemes[conversationId];
      return newThemes;
    });
  }, []);

  // Get gradient colors for current theme
  const getGradient = useCallback(
    (
      gradientName: string = 'primary',
      conversationId: number | null = null
    ): string[] => {
      const theme = conversationId
        ? getConversationTheme(conversationId)
        : currentTheme;
      return theme.gradients[gradientName] || theme.gradients.primary;
    },
    [currentTheme, getConversationTheme]
  );

  // Get shadow style for current theme
  const getShadow = useCallback(
    (
      shadowSize: string = 'medium',
      conversationId: number | null = null
    ): ShadowStyle => {
      const theme = conversationId
        ? getConversationTheme(conversationId)
        : currentTheme;
      return theme.shadows[shadowSize] || theme.shadows.medium;
    },
    [currentTheme, getConversationTheme]
  );

  // Check if conversation has special animations
  const hasAnimation = useCallback(
    (
      animationType: string,
      conversationId: number
    ): boolean | Record<string, unknown> | undefined => {
      const theme = getConversationTheme(conversationId);
      return theme.animations && theme.animations[animationType];
    },
    [getConversationTheme]
  );

  const value: ThemeContextType = {
    // Current theme
    theme: currentTheme,

    // Theme management
    setAppTheme,
    setConversationTheme,
    getConversationTheme,
    removeConversationTheme,

    // Helper functions
    getGradient,
    getShadow,
    hasAnimation,

    // Conversation themes map
    conversationThemes,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export default ThemeContext;
