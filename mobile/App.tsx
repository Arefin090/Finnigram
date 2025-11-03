import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ChatProvider } from './src/context/ChatContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { initializeLogging } from './src/services/loggerConfig';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import UserSearchScreen from './src/screens/UserSearchScreen';
import LoadingScreen from './src/components/LoadingScreen';
import { type User } from './src/services/api';

// Navigation param types
type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

type ChatStackParamList = {
  Conversations: undefined;
  Chat: {
    conversationId: number;
    conversationName?: string;
    participants?: User[];
  };
  UserSearch: undefined;
};

const AuthStack = createStackNavigator<AuthStackParamList>();
const ChatStackNav = createStackNavigator<ChatStackParamList>();
const Tab = createBottomTabNavigator();

// Wrapper component to match ChatScreen props
const ChatScreenWrapper: React.FC<StackScreenProps<ChatStackParamList, 'Chat'>> = (props) => {
  return <ChatScreen {...props} />;
};

// Auth Stack - for login/register
const AuthStackComponent: React.FC = () => (
  <AuthStack.Navigator
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: '#f8f9fa' },
    }}
  >
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Register" component={RegisterScreen} />
  </AuthStack.Navigator>
);

// Chat Stack - for conversations and chat
const ChatStack: React.FC = () => (
  <ChatStackNav.Navigator
    screenOptions={{
      headerShown: false,
    }}
  >
    <ChatStackNav.Screen name="Conversations" component={ConversationsScreen} />
    <ChatStackNav.Screen name="Chat" component={ChatScreenWrapper} />
    <ChatStackNav.Screen name="UserSearch" component={UserSearchScreen} />
  </ChatStackNav.Navigator>
);

// Main Tab Navigator
const MainTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap;

        if (route.name === 'Chats') {
          iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
        } else if (route.name === 'Profile') {
          iconName = focused ? 'person' : 'person-outline';
        } else {
          iconName = 'help-outline';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#007AFF',
      tabBarInactiveTintColor: 'gray',
      headerShown: false,
    })}
  >
    <Tab.Screen name="Chats" component={ChatStack} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>
);

// App Navigator - decides between auth and main app
const AppNavigator: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <ThemeProvider>
          <ChatProvider>
            <MainTabs />
          </ChatProvider>
        </ThemeProvider>
      ) : (
        <AuthStackComponent />
      )}
    </NavigationContainer>
  );
};

// Main App Component
const App: React.FC = () => {
  useEffect(() => {
    // Initialize logging system on app startup
    initializeLogging();
  }, []);

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
};

export default App;
