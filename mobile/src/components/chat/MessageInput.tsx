import React from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from './MessageInput.styles';

interface MessageInputProps {
  messageText: string;
  onChangeText: (text: string) => void;
  onSendMessage: () => void;
  sending: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  messageText,
  onChangeText,
  onSendMessage,
  sending,
}) => {
  return (
    <View style={styles.inputContainer}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.textInput}
          placeholder="Message..."
          placeholderTextColor="#8E8E93"
          value={messageText}
          onChangeText={onChangeText}
          multiline
          maxLength={4000}
          editable={!sending}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            messageText.trim()
              ? styles.sendButtonActive
              : styles.sendButtonInactive,
          ]}
          onPress={onSendMessage}
          disabled={!messageText.trim()}
          activeOpacity={0.7}
        >
          {messageText.trim() ? (
            <LinearGradient
              colors={['#4facfe', '#00f2fe']}
              style={styles.sendButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </LinearGradient>
          ) : (
            <Ionicons name="send" size={18} color="#8E8E93" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MessageInput;
