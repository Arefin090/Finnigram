import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userApiExports } from '../services/api';
import socketService from '../services/socket';
import { User, AuthState } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    username: string,
    password: string,
    displayName?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth reducer
type AuthAction =
  | { type: 'LOADING' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User } }
  | { type: 'ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'LOGOUT' };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOADING':
      return { ...state, loading: true, error: null };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        error: null,
        user: action.payload.user,
        isAuthenticated: true,
      };

    case 'ERROR':
      return {
        ...state,
        loading: false,
        error: action.payload,
        user: null,
        isAuthenticated: false,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'LOGOUT':
      return {
        ...state,
        loading: false,
        error: null,
        user: null,
        isAuthenticated: false,
      };

    default:
      return state;
  }
};

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  loading: true, // Start with loading true to check stored auth
  error: null,
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for stored auth on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async (): Promise<void> => {
    dispatch({ type: 'LOADING' });

    try {
      const [accessToken, , userData] = await AsyncStorage.multiGet([
        'accessToken',
        'refreshToken',
        'user',
      ]);

      if (accessToken?.[1] && userData?.[1]) {
        // Verify token is still valid
        const response = await userApiExports.getCurrentUser();

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: response.data.user },
        });

        // Connect to socket with user ID
        await socketService.connect(response.data.user.id);
      } else {
        dispatch({ type: 'LOGOUT' });
      }
    } catch (error) {
      console.warn('Auth check failed:', error);
      // Token invalid or expired, clear storage
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
      dispatch({ type: 'LOGOUT' });
    }
  };

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    dispatch({ type: 'LOADING' });

    try {
      const response = await userApiExports.login({
        email: email,
        password,
      });

      // Handle different response structures
      let user: User;
      let accessToken: string;
      let refreshToken: string;

      if (response.user && response.tokens) {
        // Current API response structure: { user: {}, tokens: { accessToken, refreshToken } }
        user = response.user;
        accessToken = response.tokens.accessToken;
        refreshToken = response.tokens.refreshToken;
      } else if (response.user) {
        // Direct response structure (fallback)
        user = response.user;
        accessToken = response.accessToken || '';
        refreshToken = response.refreshToken || '';
      } else if (response.data) {
        // Nested response structure (fallback)
        const {
          user: userData,
          accessToken: token,
          refreshToken: rToken,
        } = response.data;
        user = userData;
        accessToken = token;
        refreshToken = rToken;
      } else {
        throw new Error('Invalid response structure');
      }

      // Store tokens and user data
      await AsyncStorage.multiSet([
        ['accessToken', accessToken],
        ['refreshToken', refreshToken],
        ['user', JSON.stringify(user)],
      ]);

      dispatch({ type: 'LOGIN_SUCCESS', payload: { user } });

      // Connect to socket
      await socketService.connect(user.id);

      console.log('✅ Login successful for user:', user.username);

      return { success: true };
    } catch (error) {
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Login failed';
      dispatch({ type: 'ERROR', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const register = async (
    email: string,
    username: string,
    password: string,
    displayName?: string
  ): Promise<{ success: boolean; error?: string }> => {
    dispatch({ type: 'LOADING' });

    try {
      const response = await userApiExports.register({
        email,
        username,
        password,
        displayName: displayName || username,
      });

      // Handle different response structures
      let user: User;
      let accessToken: string;
      let refreshToken: string;

      if (response.user && response.tokens) {
        // Current API response structure: { user: {}, tokens: { accessToken, refreshToken } }
        user = response.user;
        accessToken = response.tokens.accessToken;
        refreshToken = response.tokens.refreshToken;
      } else if (response.user) {
        // Direct response structure (fallback)
        user = response.user;
        accessToken = response.accessToken || '';
        refreshToken = response.refreshToken || '';
      } else if (response.data) {
        // Nested response structure (fallback)
        const {
          user: userData,
          accessToken: token,
          refreshToken: rToken,
        } = response.data;
        user = userData;
        accessToken = token;
        refreshToken = rToken;
      } else {
        throw new Error('Invalid response structure');
      }

      // Store tokens and user data
      await AsyncStorage.multiSet([
        ['accessToken', accessToken],
        ['refreshToken', refreshToken],
        ['user', JSON.stringify(user)],
      ]);

      dispatch({ type: 'LOGIN_SUCCESS', payload: { user } });

      // Connect to socket
      await socketService.connect(user.id);

      console.log('✅ Registration successful for user:', user.username);

      return { success: true };
    } catch (error) {
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Registration failed';
      dispatch({ type: 'ERROR', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const logout = async (): Promise<void> => {
    dispatch({ type: 'LOADING' });

    try {
      // Call logout API
      await userApiExports.logout();
    } catch (error) {
      console.warn('Logout API failed:', error);
    } finally {
      // Disconnect socket
      socketService.disconnect();

      // Clear stored data regardless of API call result
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);

      dispatch({ type: 'LOGOUT' });

      console.log('✅ Logout completed');
    }
  };

  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value: AuthContextType = {
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    loading: state.loading,
    error: state.error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
