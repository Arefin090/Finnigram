import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from './Button.styles';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
}) => {
  const getSizeStyle = (size: string) => {
    switch (size) {
      case 'small':
        return styles.buttonSmall;
      case 'large':
        return styles.buttonLarge;
      default:
        return styles.buttonMedium;
    }
  };

  const getTextSizeStyle = (size: string) => {
    switch (size) {
      case 'small':
        return styles.textSmall;
      case 'large':
        return styles.textLarge;
      default:
        return styles.textMedium;
    }
  };

  const getVariantTextStyle = (variant: string) => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryText;
      case 'outline':
        return styles.outlineText;
      default:
        return styles.primaryText;
    }
  };

  const buttonStyle = [
    styles.button,
    getSizeStyle(size),
    disabled && styles.buttonDisabled,
  ];

  const textStyle = [
    styles.buttonText,
    getVariantTextStyle(variant),
    getTextSizeStyle(size),
    disabled && styles.buttonTextDisabled,
  ];

  const handlePress = () => {
    if (!disabled && !loading) {
      onPress();
    }
  };

  if (variant === 'primary' && !disabled) {
    return (
      <TouchableOpacity
        style={buttonStyle}
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={disabled || loading}
      >
        <LinearGradient
          colors={['#4facfe', '#00f2fe']}
          style={styles.gradientButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={textStyle}>{title}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[buttonStyle, styles[variant]]}
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? '#FFFFFF' : '#4facfe'}
          size="small"
        />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

export default Button;
