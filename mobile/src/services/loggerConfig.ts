/**
 * Logger Configuration and Initialization
 */
import logger, { configureLogging } from './logger';
import { LOGGING } from '../config/environment';

declare const __DEV__: boolean;

// Initialize logging based on environment configuration
export const initializeLogging = (): void => {
  configureLogging(LOGGING);

  // Log configuration on startup (only in development)
  if (__DEV__) {
    logger.info('APP', 'Logging initialized with config:', logger.getConfig());
  }
};

// Export configured logger
export default logger;
