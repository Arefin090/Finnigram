/**
 * Centralized Logging Service for Finnigram Mobile App
 * Provides configurable logging with environment-based controls
 */

const LOG_LEVELS = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  VERBOSE: 5,
};

class Logger {
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
  setLogLevel(level) {
    if (typeof level === 'string') {
      this.logLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else {
      this.logLevel = level;
    }
  }

  /**
   * Enable/disable specific logging categories
   */
  enableCategory(category) {
    this.enabledCategories.add(category);
  }

  disableCategory(category) {
    this.enabledCategories.delete(category);
  }

  /**
   * Enable/disable timestamps
   */
  setTimestamp(enabled) {
    this.isTimestampEnabled = enabled;
  }

  /**
   * Check if a log level should be output
   */
  shouldLog(level, category = null) {
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
  formatMessage(level, category, message, ...args) {
    const parts = [];

    if (this.isTimestampEnabled) {
      parts.push(new Date().toISOString());
    }

    // Level indicator
    const levelNames = {
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
  log(level, category, message, ...args) {
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
  error(category, message, ...args) {
    this.log(LOG_LEVELS.ERROR, category, message, ...args);
  }

  warn(category, message, ...args) {
    this.log(LOG_LEVELS.WARN, category, message, ...args);
  }

  info(category, message, ...args) {
    this.log(LOG_LEVELS.INFO, category, message, ...args);
  }

  debug(category, message, ...args) {
    this.log(LOG_LEVELS.DEBUG, category, message, ...args);
  }

  verbose(category, message, ...args) {
    this.log(LOG_LEVELS.VERBOSE, category, message, ...args);
  }

  /**
   * Specialized logging methods for common use cases
   */
  network(message, ...args) {
    this.debug('NETWORK', message, ...args);
  }

  auth(message, ...args) {
    this.info('AUTH', message, ...args);
  }

  socket(message, ...args) {
    this.debug('SOCKET', message, ...args);
  }

  navigation(message, ...args) {
    this.debug('NAVIGATION', message, ...args);
  }

  state(message, ...args) {
    this.verbose('STATE', message, ...args);
  }

  performance(message, ...args) {
    this.info('PERFORMANCE', message, ...args);
  }

  /**
   * Group logging for complex operations
   */
  group(label, collapsed = false) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      if (collapsed) {
        console.groupCollapsed(label);
      } else {
        console.group(label);
      }
    }
  }

  groupEnd() {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.groupEnd();
    }
  }

  /**
   * Time measurement utilities
   */
  time(label) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.timeEnd(label);
    }
  }

  /**
   * Configuration for development vs production
   */
  configure(options = {}) {
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
  getConfig() {
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
export const configureLogging = options => {
  logger.configure(options);
};

// Development helper - expose logger globally for debugging
if (__DEV__) {
  global.__FINNIGRAM_LOGGER__ = logger;
}
