/**
 * Logout Service - Handles secure logout operations
 * Extracted from AuthContext for better maintainability and testability
 */
import { authApi } from './api';
import socketService from './socket';
import retryService from './RetryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from './loggerConfig';
import { AxiosResponse } from 'axios';

// Type definitions
interface LogoutMetrics {
  startTime: number | null;
  serverLogoutSuccess: boolean;
  socketDisconnected: boolean;
  cleanupSuccess: boolean;
  duration: number;
}

interface LogoutResult {
  success: boolean;
  duration?: number;
  error?: string;
  serverLogoutSuccess?: boolean;
  socketDisconnected?: boolean;
  cleanupSuccess?: boolean;
  emergency?: boolean;
  originalError?: string;
}

interface NetworkConfig {
  baseDelay: number;
}

export class LogoutService {
  private isLoggingOut: boolean = false;
  private logoutMetrics: LogoutMetrics = {
    startTime: null,
    serverLogoutSuccess: false,
    socketDisconnected: false,
    cleanupSuccess: false,
    duration: 0,
  };

  constructor() {
    // Properties initialized above
  }

  /**
   * Execute complete logout process with comprehensive cleanup
   */
  async executeLogout(): Promise<LogoutResult> {
    if (this.isLoggingOut) {
      logger.warn(
        'AUTH',
        'Logout already in progress, ignoring duplicate request'
      );
      return { success: false, error: 'Logout already in progress' };
    }

    this.isLoggingOut = true;
    this.resetMetrics();

    logger.group('🚪 Logout Process');
    logger.auth('Starting logout process...');

    try {
      const result = await this.performLogout();
      logger.auth(`Logout completed successfully in ${result.duration}ms`);
      logger.groupEnd();
      return result;
    } catch (error: unknown) {
      logger.error('AUTH', 'Critical error during logout:', error);
      logger.groupEnd();

      // Emergency cleanup - ensure user is logged out locally
      const emergencyResult = await this.performEmergencyCleanup(error);
      return emergencyResult;
    } finally {
      this.isLoggingOut = false;
    }
  }

  /**
   * Reset metrics for new logout attempt
   */
  private resetMetrics(): void {
    this.logoutMetrics = {
      startTime: Date.now(),
      serverLogoutSuccess: false,
      socketDisconnected: false,
      cleanupSuccess: false,
      duration: 0,
    };
  }

  /**
   * Main logout process
   */
  private async performLogout(): Promise<LogoutResult> {
    // Step 1: Graceful socket disconnection
    await this.handleSocketDisconnection();

    // Step 2: Server-side logout with retry logic
    await this.handleServerLogout();

    // Step 3: Local cleanup and verification
    await this.handleLocalCleanup();

    // Step 4: Calculate final metrics
    this.logoutMetrics.duration =
      Date.now() - (this.logoutMetrics.startTime || 0);

    return {
      success: true,
      ...this.logoutMetrics,
    };
  }

  /**
   * Handle socket disconnection with verification
   */
  private async handleSocketDisconnection(): Promise<void> {
    logger.auth('Initiating socket disconnection...');

    try {
      const socketStatus = socketService.getConnectionStatus();

      if (socketStatus.isConnected) {
        logger.socket('Emitting user_offline event...');
        socketService.emit('user_offline');

        // Network-aware delay for graceful disconnection
        const networkConfig =
          (await retryService.getNetworkAwareConfig()) as NetworkConfig;
        const delay = Math.min(networkConfig.baseDelay / 2, 1000);
        await this.delay(delay);
      }

      // Disconnect socket
      socketService.disconnect();

      // Verify disconnection
      await this.delay(100);
      const finalStatus = socketService.getConnectionStatus();
      this.logoutMetrics.socketDisconnected = !finalStatus.isConnected;

      logger.socket(
        `Socket disconnection verified: ${this.logoutMetrics.socketDisconnected}`
      );
    } catch (error: unknown) {
      logger.error('SOCKET', 'Socket disconnection error:', error);
      // Continue with logout process even if socket fails
    }
  }

  /**
   * Handle server-side logout with smart retry
   */
  private async handleServerLogout(): Promise<void> {
    logger.auth('Calling logout API with retry logic...');

    try {
      const response = await retryService.executeWithRetry(
        async (): Promise<AxiosResponse<unknown>> => {
          logger.network('Attempting logout API call...');
          return await authApi.logout();
        },
        {
          maxRetries: 2,
          baseDelay: 1000,
          retryOn: [408, 429, 500, 502, 503, 504],
          onRetry: (error: Error, attempt: number): void => {
            logger.warn(
              'NETWORK',
              `Logout API retry ${attempt}: ${error.message}`
            );
          },
        }
      );

      logger.network('Logout API successful:', response.data);
      this.logoutMetrics.serverLogoutSuccess = true;
    } catch (apiError: unknown) {
      const error = apiError as {
        response?: { status?: number; statusText?: string; data?: unknown };
        message?: string;
      };
      logger.warn('NETWORK', 'Logout API failed after retries:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      // Don't block logout on API failure - user should always be able to logout locally
      logger.auth('Proceeding with local logout despite API failure');
    }
  }

  /**
   * Handle local cleanup with verification
   */
  private async handleLocalCleanup(): Promise<void> {
    logger.auth('Starting local cleanup...');

    try {
      // Clear stored data
      logger.auth('Clearing stored authentication data...');
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);

      // Verify cleanup
      const remainingTokens = await AsyncStorage.multiGet([
        'accessToken',
        'refreshToken',
        'user',
      ]);
      const hasRemainingData = remainingTokens.some(
        ([, value]) => value !== null
      );

      if (hasRemainingData) {
        logger.warn(
          'AUTH',
          'Some authentication data may still remain, forcing individual cleanup'
        );
        await this.forceIndividualCleanup();
      }

      this.logoutMetrics.cleanupSuccess = true;
      logger.auth('Local cleanup completed successfully');
    } catch (cleanupError: unknown) {
      logger.error('AUTH', 'Error during local cleanup:', cleanupError);

      // Attempt force cleanup
      try {
        await this.forceIndividualCleanup();
        this.logoutMetrics.cleanupSuccess = true;
        logger.auth('Force cleanup successful');
      } catch (forceError: unknown) {
        logger.error('AUTH', 'Force cleanup also failed:', forceError);
        this.logoutMetrics.cleanupSuccess = false;
      }
    }
  }

  /**
   * Force individual cleanup as fallback
   */
  private async forceIndividualCleanup(): Promise<void> {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('user');
  }

  /**
   * Emergency cleanup when main process fails
   */
  private async performEmergencyCleanup(
    originalError: unknown
  ): Promise<LogoutResult> {
    const error = originalError as { message?: string };
    logger.error(
      'AUTH',
      'Performing emergency cleanup due to error:',
      originalError
    );

    try {
      // Force socket disconnection
      try {
        socketService.disconnect();
      } catch (socketError: unknown) {
        logger.error(
          'SOCKET',
          'Emergency socket disconnection failed:',
          socketError
        );
      }

      // Force local cleanup
      await this.forceIndividualCleanup();

      const duration = Date.now() - (this.logoutMetrics.startTime || 0);

      logger.auth('Emergency logout completed');

      return {
        success: true, // User is logged out locally, which is what matters
        serverLogoutSuccess: false,
        socketDisconnected: false,
        cleanupSuccess: true,
        duration,
        error: error.message,
        emergency: true,
      };
    } catch (emergencyError: unknown) {
      const emergencyErr = emergencyError as { message?: string };
      logger.error('AUTH', 'Emergency cleanup failed:', emergencyError);

      return {
        success: false,
        error: `Emergency cleanup failed: ${emergencyErr.message}`,
        originalError: error.message,
      };
    }
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current logout status
   */
  public isLogoutInProgress(): boolean {
    return this.isLoggingOut;
  }

  /**
   * Get last logout metrics (for debugging)
   */
  public getLastLogoutMetrics(): LogoutMetrics {
    return { ...this.logoutMetrics };
  }
}

// Export singleton instance
export const logoutService = new LogoutService();
export default logoutService;
