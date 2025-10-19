import React, { createContext, useContext, useState, useCallback } from 'react';
import { defaultTheme, getThemeForRelationship } from '../themes';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(defaultTheme);
  const [conversationThemes, setConversationThemes] = useState({});

  // Set theme for the entire app
  const setAppTheme = useCallback((theme) => {
    setCurrentTheme(theme);
  }, []);

  // Set theme for a specific conversation
  const setConversationTheme = useCallback((conversationId, relationshipType) => {
    const theme = getThemeForRelationship(relationshipType);
    setConversationThemes(prev => ({
      ...prev,
      [conversationId]: theme,
    }));
  }, []);

  // Get theme for a specific conversation
  const getConversationTheme = useCallback((conversationId) => {
    return conversationThemes[conversationId] || currentTheme;
  }, [conversationThemes, currentTheme]);

  // Remove theme for a conversation
  const removeConversationTheme = useCallback((conversationId) => {
    setConversationThemes(prev => {
      const newThemes = { ...prev };
      delete newThemes[conversationId];
      return newThemes;
    });
  }, []);

  // Get gradient colors for current theme
  const getGradient = useCallback((gradientName = 'primary', conversationId = null) => {
    const theme = conversationId ? getConversationTheme(conversationId) : currentTheme;
    return theme.gradients[gradientName] || theme.gradients.primary;
  }, [currentTheme, getConversationTheme]);

  // Get shadow style for current theme
  const getShadow = useCallback((shadowSize = 'medium', conversationId = null) => {
    const theme = conversationId ? getConversationTheme(conversationId) : currentTheme;
    return theme.shadows[shadowSize] || theme.shadows.medium;
  }, [currentTheme, getConversationTheme]);

  // Check if conversation has special animations
  const hasAnimation = useCallback((animationType, conversationId) => {
    const theme = getConversationTheme(conversationId);
    return theme.animations && theme.animations[animationType];
  }, [getConversationTheme]);

  const value = {
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
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;