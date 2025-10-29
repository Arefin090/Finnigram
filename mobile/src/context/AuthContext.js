import React, { createContext, useContext, useEffect, useReducer } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';
import socketService from '../services/socket';
import logoutService from '../services/LogoutService';
import logger from '../services/loggerConfig';

const AuthContext = createContext();

// Auth reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        error: null,
      };

    case 'LOGOUT':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        error: null,
      };

    case 'ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
};

const initialState = {
  loading: true,
  isAuthenticated: false,
  user: null,
  error: null,
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing auth on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    dispatch({ type: 'LOADING' });

    try {
      const [accessToken, refreshToken, userData] = await AsyncStorage.multiGet(
        ['accessToken', 'refreshToken', 'user']
      );

      if (accessToken[1] && userData[1]) {
        logger.auth('Found stored tokens, verifying with server...');

        // Verify token is still valid
        const response = await authApi.getCurrentUser();

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: response.data.user },
        });

        logger.auth(
          `Authentication verified for user: ${response.data.user.username}`
        );

        // Connect socket
        try {
          await socketService.connect();
          logger.socket('Socket connected successfully');
        } catch (socketError) {
          logger.warn('SOCKET', 'Socket connection failed:', socketError);
        }
      } else {
        logger.auth('No valid tokens found, user needs to login');
        dispatch({ type: 'LOGOUT' });
      }
    } catch (error) {
      logger.error('AUTH', 'Auth check failed:', error);

      // Clear invalid tokens
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
      dispatch({ type: 'LOGOUT' });
    }
  };

  const login = async (email, password) => {
    dispatch({ type: 'LOADING' });

    try {
      logger.auth(`Attempting login for email: ${email}`);
      const response = await authApi.login(email, password);
      const { user, tokens } = response.data;

      // Store tokens and user data
      await AsyncStorage.multiSet([
        ['accessToken', tokens.accessToken],
        ['refreshToken', tokens.refreshToken],
        ['user', JSON.stringify(user)],
      ]);

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user },
      });

      logger.auth(`Login successful for user: ${user.username}`);

      // Connect socket
      try {
        await socketService.connect();
        logger.socket('Socket connected after login');
      } catch (socketError) {
        logger.warn(
          'SOCKET',
          'Socket connection failed after login:',
          socketError
        );
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      logger.error('AUTH', `Login failed for ${email}:`, errorMessage);
      dispatch({ type: 'ERROR', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const register = async (email, username, password, displayName) => {
    dispatch({ type: 'LOADING' });

    try {
      const response = await authApi.register(
        email,
        username,
        password,
        displayName
      );
      const { user, tokens } = response.data;

      // Store tokens and user data
      await AsyncStorage.multiSet([
        ['accessToken', tokens.accessToken],
        ['refreshToken', tokens.refreshToken],
        ['user', JSON.stringify(user)],
      ]);

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user },
      });

      // Connect socket
      try {
        await socketService.connect();
      } catch (socketError) {
        console.warn('Socket connection failed after register:', socketError);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Registration failed';
      dispatch({ type: 'ERROR', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    dispatch({ type: 'LOADING' });

    try {
      // Use the dedicated logout service
      const result = await logoutService.executeLogout();

      // Update auth state to logged out
      dispatch({ type: 'LOGOUT' });

      return result;
    } catch (error) {
      logger.error('AUTH', 'Logout failed in AuthContext:', error);

      // Emergency state update - ensure user appears logged out
      dispatch({ type: 'LOGOUT' });

      return {
        success: true, // User is logged out in UI
        emergency: true,
        error: error.message,
      };
    }
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const updateUser = userData => {
    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { user: { ...state.user, ...userData } },
    });
  };

  const value = {
    ...state,
    login,
    register,
    logout,
    clearError,
    updateUser,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
