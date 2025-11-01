/**
 * Retry Service - Handles network failures with smart retry logic
 */
import logger from './loggerConfig';

// Type definitions
interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryOn?: number[];
  onRetry?: ((error: Error, attempt: number) => void) | null;
}

interface RetryUntilOptions {
  maxRetries?: number;
  delay?: number;
  timeout?: number;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringWindow?: number;
}

interface NetworkAwareConfig {
  maxRetries: number;
  baseDelay: number;
}

type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

class RetryService {
  private defaultOptions: Required<RetryOptions>;

  constructor() {
    this.defaultOptions = {
      maxRetries: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 10000, // 10 seconds
      backoffFactor: 2,
      retryOn: [408, 429, 500, 502, 503, 504], // HTTP status codes to retry
      onRetry: null, // Callback for retry attempts
    };
  }

  /**
   * Execute a function with exponential backoff retry
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    let lastError: Error;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        logger.network(
          `Executing attempt ${attempt + 1}/${config.maxRetries + 1}`
        );
        const result = await fn();

        if (attempt > 0) {
          logger.network(`Success after ${attempt} retries`);
        }

        return result;
      } catch (error: unknown) {
        lastError = error as Error;

        // Don't retry on the last attempt
        if (attempt === config.maxRetries) {
          break;
        }

        // Check if we should retry this error
        if (!this.shouldRetry(lastError, config)) {
          logger.network('Error not retryable:', lastError.message);
          throw lastError;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt),
          config.maxDelay
        );

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000;

        logger.network(`Attempt ${attempt + 1} failed: ${lastError.message}`);
        logger.network(`Retrying in ${Math.round(jitteredDelay)}ms...`);

        // Call retry callback if provided
        if (config.onRetry) {
          config.onRetry(lastError, attempt + 1);
        }

        await this.delay(jitteredDelay);
      }
    }

    logger.network(`All ${config.maxRetries + 1} attempts failed`);
    throw lastError;
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(error: Error, config: Required<RetryOptions>): boolean {
    const errorWithCode = error as Error & {
      code?: string;
      response?: { status?: number };
    };

    // Network errors
    if (
      errorWithCode.code === 'NETWORK_ERROR' ||
      error.message.includes('Network Error')
    ) {
      return true;
    }

    // Timeout errors
    if (
      errorWithCode.code === 'ECONNABORTED' ||
      error.message.includes('timeout')
    ) {
      return true;
    }

    // HTTP status codes
    if (errorWithCode.response && errorWithCode.response.status) {
      return config.retryOn.includes(errorWithCode.response.status);
    }

    // Unknown errors - don't retry to be safe
    return false;
  }

  /**
   * Simple delay helper
   */
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry with custom condition
   */
  async retryUntil<T>(
    fn: () => Promise<T>,
    condition: (result: T) => boolean,
    options: RetryUntilOptions = {}
  ): Promise<T> {
    const config = {
      maxRetries: 10,
      delay: 1000,
      timeout: 30000, // 30 seconds total timeout
      ...options,
    };

    const startTime = Date.now();

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      // Check timeout
      if (Date.now() - startTime > config.timeout) {
        throw new Error('Retry timeout exceeded');
      }

      try {
        const result = await fn();

        if (condition(result)) {
          return result;
        }

        logger.network(
          `Attempt ${attempt + 1}: Condition not met, retrying...`
        );
        await this.delay(config.delay);
      } catch (error: unknown) {
        if (attempt === config.maxRetries) {
          throw error;
        }

        const err = error as Error;
        logger.network(`Attempt ${attempt + 1} failed: ${err.message}`);
        await this.delay(config.delay);
      }
    }

    throw new Error('Maximum retries exceeded');
  }

  /**
   * Circuit breaker pattern for preventing cascade failures
   */
  createCircuitBreaker<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    options: CircuitBreakerOptions = {}
  ): (...args: T) => Promise<R> {
    const config = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringWindow: 300000, // 5 minutes
      ...options,
    };

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failures = 0;
    let lastFailureTime = 0;
    let successCount = 0;

    return async (...args: T): Promise<R> => {
      const now = Date.now();

      // Reset failure count after monitoring window
      if (now - lastFailureTime > config.monitoringWindow) {
        failures = 0;
      }

      if (state === 'OPEN') {
        // Check if we should try again
        if (now - lastFailureTime > config.resetTimeout) {
          state = 'HALF_OPEN';
          successCount = 0;
          logger.network('Circuit breaker: HALF_OPEN');
        } else {
          throw new Error('Circuit breaker is OPEN - service unavailable');
        }
      }

      try {
        const result = await fn(...args);

        // Success
        if (state === 'HALF_OPEN') {
          successCount++;
          // After 3 successful calls, close the circuit
          if (successCount >= 3) {
            state = 'CLOSED';
            failures = 0;
            logger.network('Circuit breaker: CLOSED');
          }
        }

        return result;
      } catch (error: unknown) {
        failures++;
        lastFailureTime = now;

        if (state === 'HALF_OPEN') {
          state = 'OPEN';
          logger.network('Circuit breaker: OPEN (failed during half-open)');
        } else if (failures >= config.failureThreshold) {
          state = 'OPEN';
          logger.network('Circuit breaker: OPEN (threshold exceeded)');
        }

        throw error;
      }
    };
  }

  /**
   * Get network quality indicator
   */
  async getNetworkQuality(): Promise<NetworkQuality> {
    try {
      const startTime = Date.now();
      // Simple ping test
      await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
      });
      const duration = Date.now() - startTime;

      if (duration < 100) return 'excellent';
      if (duration < 300) return 'good';
      if (duration < 1000) return 'fair';
      return 'poor';
    } catch {
      return 'offline';
    }
  }

  /**
   * Network-aware retry configuration
   */
  async getNetworkAwareConfig(): Promise<NetworkAwareConfig> {
    const quality = await this.getNetworkQuality();

    switch (quality) {
      case 'excellent':
        return { maxRetries: 2, baseDelay: 500 };
      case 'good':
        return { maxRetries: 3, baseDelay: 1000 };
      case 'fair':
        return { maxRetries: 4, baseDelay: 2000 };
      case 'poor':
        return { maxRetries: 5, baseDelay: 5000 };
      case 'offline':
        return { maxRetries: 0, baseDelay: 0 };
      default:
        return this.defaultOptions;
    }
  }
}

// Export singleton instance
const retryService = new RetryService();
export default retryService;
