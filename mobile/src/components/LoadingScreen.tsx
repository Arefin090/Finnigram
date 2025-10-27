import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LoadingScreenProps } from '../types';

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Loading Finnigram...',
}) => {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});

export default LoadingScreen;
