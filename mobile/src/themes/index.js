// Finnigram Theme System
// Foundation for relationship-aware theming

const baseColors = {
  // Primary Brand Colors
  primary: '#4facfe',
  primaryDark: '#00f2fe',
  
  // Secondary Colors
  secondary: '#667eea',
  secondaryDark: '#764ba2',
  
  // Neutral Colors
  black: '#000000',
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  
  // iOS System Colors
  systemBlue: '#007AFF',
  systemGreen: '#34C759',
  systemRed: '#FF3B30',
  systemOrange: '#FF9500',
  systemYellow: '#FFCC00',
  systemPurple: '#AF52DE',
  systemPink: '#FF2D92',
  systemIndigo: '#5856D6',
  
  // Background Colors
  background: '#F2F2F7',
  surface: '#FFFFFF',
  
  // Text Colors
  textPrimary: '#000000',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',
  
  // Border Colors
  border: '#E5E5EA',
  separator: '#C6C6C8',
};

// Default theme for normal conversations
export const defaultTheme = {
  name: 'default',
  colors: {
    ...baseColors,
    chatBubble: baseColors.primary,
    chatBubbleGradient: [baseColors.primary, baseColors.primaryDark],
  },
  gradients: {
    primary: [baseColors.primary, baseColors.primaryDark],
    secondary: [baseColors.secondary, baseColors.secondaryDark],
  },
  shadows: {
    small: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    large: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
  },
};

// Special person theme (romantic/partner)
export const specialPersonTheme = {
  name: 'special_person',
  colors: {
    ...baseColors,
    chatBubble: '#FF6B9D',
    chatBubbleGradient: ['#FF6B9D', '#C44569'],
  },
  gradients: {
    primary: ['#FF6B9D', '#C44569'],
    secondary: ['#F8B500', '#FF6B9D'],
    heart: ['#FF416C', '#FF4B2B'],
  },
  shadows: {
    ...defaultTheme.shadows,
    heart: {
      shadowColor: '#FF416C',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
  },
  animations: {
    heartParticles: true,
    specialEffects: true,
  },
};

// Family theme (warm, comforting)
export const familyTheme = {
  name: 'family',
  colors: {
    ...baseColors,
    chatBubble: '#52c234',
    chatBubbleGradient: ['#52c234', '#061700'],
  },
  gradients: {
    primary: ['#52c234', '#061700'],
    secondary: ['#FFA726', '#FF7043'],
    warm: ['#FFCC02', '#FFA726'],
  },
  shadows: defaultTheme.shadows,
  animations: {
    gentle: true,
  },
};

// Best friend theme (fun, energetic)
export const bestFriendTheme = {
  name: 'best_friend',
  colors: {
    ...baseColors,
    chatBubble: '#667eea',
    chatBubbleGradient: ['#667eea', '#764ba2'],
  },
  gradients: {
    primary: ['#667eea', '#764ba2'],
    secondary: ['#a8edea', '#fed6e3'],
    fun: ['#ff9a9e', '#fecfef'],
  },
  shadows: defaultTheme.shadows,
  animations: {
    sparkles: true,
    bouncy: true,
  },
};

// Theme mapping for relationship types
export const relationshipThemes = {
  normal: defaultTheme,
  special: specialPersonTheme,
  family: familyTheme,
  best_friend: bestFriendTheme,
};

// Helper function to get theme by relationship type
export const getThemeForRelationship = (relationshipType = 'normal') => {
  return relationshipThemes[relationshipType] || defaultTheme;
};

// Helper function to get gradient colors
export const getGradient = (theme, gradientName = 'primary') => {
  return theme.gradients[gradientName] || theme.gradients.primary;
};

// Helper function to get shadow style
export const getShadow = (theme, shadowSize = 'medium') => {
  return theme.shadows[shadowSize] || theme.shadows.medium;
};

export default {
  defaultTheme,
  specialPersonTheme,
  familyTheme,
  bestFriendTheme,
  relationshipThemes,
  getThemeForRelationship,
  getGradient,
  getShadow,
};