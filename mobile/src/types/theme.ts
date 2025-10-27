// Theme Types
export interface Colors {
  primary: string;
  primaryDark: string;
  secondary: string;
  secondaryDark: string;
  black: string;
  white: string;
  gray50: string;
  gray100: string;
  gray200: string;
  gray300: string;
  gray400: string;
  gray500: string;
  gray600: string;
  gray700: string;
  gray800: string;
  gray900: string;
  systemBlue: string;
  systemGreen: string;
  systemRed: string;
  systemOrange: string;
  systemYellow: string;
  systemPurple: string;
  systemPink: string;
  systemIndigo: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  separator: string;
  chatBubble: string;
  chatBubbleGradient: string[];
}

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Theme {
  name: string;
  colors: Colors;
  gradients: {
    primary: string[];
    secondary: string[];
    [key: string]: string[];
  };
  shadows: {
    small: ShadowStyle;
    medium: ShadowStyle;
    large: ShadowStyle;
    [key: string]: ShadowStyle;
  };
  animations?: {
    [key: string]: boolean;
  };
}

export type RelationshipType = 'normal' | 'special' | 'family' | 'best_friend';

export interface ThemeContextType {
  theme: Theme;
  setAppTheme: (theme: Theme) => void;
  setConversationTheme: (
    conversationId: number,
    relationshipType: RelationshipType
  ) => void;
  getConversationTheme: (conversationId: number) => Theme;
  removeConversationTheme: (conversationId: number) => void;
  getGradient: (
    gradientName?: string,
    conversationId?: number | null
  ) => string[];
  getShadow: (
    shadowSize?: string,
    conversationId?: number | null
  ) => ShadowStyle;
  hasAnimation: (animationType: string, conversationId: number) => boolean;
  conversationThemes: Record<number, Theme>;
}
