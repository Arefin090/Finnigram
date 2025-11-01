import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, type User } from '../services/api';
import socketService from '../services/socket';
import logoutService from '../services/LogoutService';
import logger from '../services/loggerConfig';

// Type definitions for Auth context
interface AuthState {
  loading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  error: string | null;
}

interface LoginSuccessAction {
  type: 'LOGIN_SUCCESS';
  payload: { user: User };
}

interface LogoutAction {
  type: 'LOGOUT';
}

interface LoadingAction {
  type: 'LOADING';
}

interface ErrorAction {
  type: 'ERROR';
  payload: string;
}

interface ClearErrorAction {
  type: 'CLEAR_ERROR';
}

type AuthAction =
  | LoginSuccessAction
  | LogoutAction
  | LoadingAction
  | ErrorAction
  | ClearErrorAction;

interface AuthResponse {
  success: boolean;
  error?: string;
  emergency?: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (
    email: string,
    username: string,
    password: string,
    displayName: string
  ) => Promise<AuthResponse>;
  logout: () => Promise<AuthResponse>;
  clearError: () => void;
  updateUser: (userData: Partial<User>) => void;
  checkAuthStatus: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
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

const initialState: AuthState = {
  loading: true,
  isAuthenticated: false,
  user: null,
  error: null,
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing auth on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async (): Promise<void> => {
    dispatch({ type: 'LOADING' });

    try {
      const [accessToken, _refreshToken, userData] =
        await AsyncStorage.multiGet(['accessToken', 'refreshToken', 'user']);

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

  const login = async (
    email: string,
    password: string
  ): Promise<AuthResponse> => {
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
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      const errorMessage = axiosError.response?.data?.error || 'Login failed';
      logger.error('AUTH', `Login failed for ${email}:`, errorMessage);
      dispatch({ type: 'ERROR', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const register = async (
    email: string,
    username: string,
    password: string,
    displayName: string
  ): Promise<AuthResponse> => {
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
        logger.warn(
          'SOCKET',
          'Socket connection failed after register:',
          socketError
        );
      }

      return { success: true };
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      const errorMessage =
        axiosError.response?.data?.error || 'Registration failed';
      dispatch({ type: 'ERROR', payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const logout = async (): Promise<AuthResponse> => {
    dispatch({ type: 'LOADING' });

    try {
      // Use the dedicated logout service
      const result = await logoutService.executeLogout();

      // Update auth state to logged out
      dispatch({ type: 'LOGOUT' });

      return result;
    } catch (error: unknown) {
      logger.error('AUTH', 'Logout failed in AuthContext:', error);

      // Emergency state update - ensure user appears logged out
      dispatch({ type: 'LOGOUT' });

      return {
        success: true, // User is logged out in UI
        emergency: true,
        error: (error as Error).message,
      };
    }
  };

  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const updateUser = (userData: Partial<User>): void => {
    const currentUser = state.user as User; // updateUser should only be called when user exists
    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { user: { ...currentUser, ...userData } },
    });
  };

  const value: AuthContextType = {
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

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
