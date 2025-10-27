import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { defaultTheme, getThemeForRelationship } from '../themes';
import { Theme, ThemeContextType, RelationshipType } from '../types/theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);
  const [conversationThemes, setConversationThemes] = useState<
    Record<number, Theme>
  >({});

  // Set theme for the entire app
  const setAppTheme = useCallback((theme: Theme) => {
    setCurrentTheme(theme);
  }, []);

  // Set theme for a specific conversation
  const setConversationTheme = useCallback(
    (conversationId: number, relationshipType: RelationshipType) => {
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
      gradientName = 'primary',
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
    (shadowSize = 'medium', conversationId: number | null = null) => {
      const theme = conversationId
        ? getConversationTheme(conversationId)
        : currentTheme;
      return theme.shadows[shadowSize] || theme.shadows.medium;
    },
    [currentTheme, getConversationTheme]
  );

  // Check if conversation has special animations
  const hasAnimation = useCallback(
    (animationType: string, conversationId: number): boolean => {
      const theme = getConversationTheme(conversationId);
      return Boolean(theme.animations && theme.animations[animationType]);
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
