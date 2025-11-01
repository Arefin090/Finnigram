/* eslint-disable no-console */
/**
 * Centralized Logging Service for Finnigram Mobile App
 * Provides configurable logging with environment-based controls
 */

// Type definitions
interface LoggerConfig {
  level?: string | number;
  categories?: string[];
  timestamp?: boolean;
}

interface LoggerConfiguration {
  level: number;
  enabledCategories: string[];
  timestamp: boolean;
}

declare const __DEV__: boolean;

declare global {
  // eslint-disable-next-line no-var
  var __FINNIGRAM_LOG_LEVEL__: number | undefined;
  // eslint-disable-next-line no-var
  var __FINNIGRAM_LOGGER__: Logger | undefined;
}

const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  VERBOSE: 5,
} as const;

class Logger {
  private logLevel: number;
  private enabledCategories: Set<string>;
  private isTimestampEnabled: boolean;
  private isFileLoggingEnabled: boolean;

  constructor() {
    // Set default log level based on environment
    this.logLevel = __DEV__ ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR;

    // Allow override via global config
    if (global.__FINNIGRAM_LOG_LEVEL__ !== undefined) {
      this.logLevel = global.__FINNIGRAM_LOG_LEVEL__;
    }

    this.enabledCategories = new Set();
    this.isTimestampEnabled = __DEV__;
    this.isFileLoggingEnabled = false;
  }

  /**
   * Set the global log level
   */
  setLogLevel(level: string | number): void {
    if (typeof level === 'string') {
      this.logLevel =
        LOG_LEVELS[level.toUpperCase() as keyof typeof LOG_LEVELS] ||
        LOG_LEVELS.INFO;
    } else {
      this.logLevel = level;
    }
  }

  /**
   * Enable/disable specific logging categories
   */
  enableCategory(category: string): void {
    this.enabledCategories.add(category);
  }

  disableCategory(category: string): void {
    this.enabledCategories.delete(category);
  }

  /**
   * Enable/disable timestamps
   */
  setTimestamp(enabled: boolean): void {
    this.isTimestampEnabled = enabled;
  }

  /**
   * Check if a log level should be output
   */
  shouldLog(level: number, category: string | null = null): boolean {
    if (this.logLevel === LOG_LEVELS.NONE) return false;

    // Check level
    if (level > this.logLevel) return false;

    // Check category filter (if categories are specified, only log enabled ones)
    if (
      this.enabledCategories.size > 0 &&
      category &&
      !this.enabledCategories.has(category)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Format log message with timestamp and metadata
   */
  formatMessage(
    level: number,
    category: string | null,
    message: unknown,
    ...args: unknown[]
  ): [string, unknown, ...unknown[]] {
    const parts: string[] = [];

    if (this.isTimestampEnabled) {
      parts.push(new Date().toISOString());
    }

    // Level indicator
    const levelNames: { [key: number]: string } = {
      [LOG_LEVELS.ERROR]: '❌ ERROR',
      [LOG_LEVELS.WARN]: '⚠️  WARN',
      [LOG_LEVELS.INFO]: '📝 INFO',
      [LOG_LEVELS.DEBUG]: '🐛 DEBUG',
      [LOG_LEVELS.VERBOSE]: '📊 VERBOSE',
    };
    parts.push(levelNames[level] || 'LOG');

    if (category) {
      parts.push(`[${category}]`);
    }

    const prefix = parts.join(' ') + ':';

    return [prefix, message, ...args];
  }

  /**
   * Core logging method
   */
  log(
    level: number,
    category: string | null,
    message: unknown,
    ...args: unknown[]
  ): void {
    if (!this.shouldLog(level, category)) return;

    const formattedArgs = this.formatMessage(level, category, message, ...args);

    // Use appropriate console method based on level
    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(...formattedArgs);
        break;
      case LOG_LEVELS.WARN:
        console.warn(...formattedArgs);
        break;
      case LOG_LEVELS.INFO:
        console.info(...formattedArgs);
        break;
      case LOG_LEVELS.DEBUG:
      case LOG_LEVELS.VERBOSE:
      default:
        console.log(...formattedArgs);
        break;
    }
  }

  /**
   * Convenience methods
   */
  error(category: string, message: unknown, ...args: unknown[]): void {
    this.log(LOG_LEVELS.ERROR, category, message, ...args);
  }

  warn(category: string, message: unknown, ...args: unknown[]): void {
    this.log(LOG_LEVELS.WARN, category, message, ...args);
  }

  info(category: string, message: unknown, ...args: unknown[]): void {
    this.log(LOG_LEVELS.INFO, category, message, ...args);
  }

  debug(category: string, message: unknown, ...args: unknown[]): void {
    this.log(LOG_LEVELS.DEBUG, category, message, ...args);
  }

  verbose(category: string, message: unknown, ...args: unknown[]): void {
    this.log(LOG_LEVELS.VERBOSE, category, message, ...args);
  }

  /**
   * Specialized logging methods for common use cases
   */
  network(message: unknown, ...args: unknown[]): void {
    this.debug('NETWORK', message, ...args);
  }

  auth(message: unknown, ...args: unknown[]): void {
    this.info('AUTH', message, ...args);
  }

  socket(message: unknown, ...args: unknown[]): void {
    this.debug('SOCKET', message, ...args);
  }

  navigation(message: unknown, ...args: unknown[]): void {
    this.debug('NAVIGATION', message, ...args);
  }

  state(message: unknown, ...args: unknown[]): void {
    this.verbose('STATE', message, ...args);
  }

  performance(message: unknown, ...args: unknown[]): void {
    this.info('PERFORMANCE', message, ...args);
  }

  /**
   * Group logging for complex operations
   */
  group(label: string, collapsed: boolean = false): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      if (collapsed) {
        console.groupCollapsed(label);
      } else {
        console.group(label);
      }
    }
  }

  groupEnd(): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.groupEnd();
    }
  }

  /**
   * Time measurement utilities
   */
  time(label: string): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.time(label);
    }
  }

  timeEnd(label: string): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.timeEnd(label);
    }
  }

  /**
   * Configuration for development vs production
   */
  configure(options: LoggerConfig = {}): void {
    if (options.level !== undefined) {
      this.setLogLevel(options.level);
    }

    if (options.categories) {
      this.enabledCategories.clear();
      options.categories.forEach(cat => this.enableCategory(cat));
    }

    if (options.timestamp !== undefined) {
      this.setTimestamp(options.timestamp);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfiguration {
    return {
      level: this.logLevel,
      enabledCategories: Array.from(this.enabledCategories),
      timestamp: this.isTimestampEnabled,
    };
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the instance and the level constants
export { LOG_LEVELS };
export default logger;

// Global configuration helper
export const configureLogging = (options: LoggerConfig): void => {
  logger.configure(options);
};

// Development helper - expose logger globally for debugging
if (__DEV__) {
  global.__FINNIGRAM_LOGGER__ = logger;
}
