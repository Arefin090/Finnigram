// Environment configuration for Finnigram

// Type definitions
interface LoggingConfig {
  level: string;
  categories: string[];
  timestamp: boolean;
}

interface EnvironmentConfig {
  USER_SERVICE_URL: string;
  MESSAGE_SERVICE_URL: string;
  REALTIME_SERVICE_URL: string;
  LOGGING: LoggingConfig;
}

interface Config {
  development: EnvironmentConfig;
  production: EnvironmentConfig;
}

declare const __DEV__: boolean;

const config: Config = {
  development: {
    USER_SERVICE_URL: 'http://localhost:3001/api',
    MESSAGE_SERVICE_URL: 'http://localhost:3002/api',
    REALTIME_SERVICE_URL: 'http://localhost:3003',
    LOGGING: {
      level: 'DEBUG',
      categories: ['AUTH', 'NETWORK', 'SOCKET'], // Enable specific categories
      timestamp: true,
    },
  },
  production: {
    USER_SERVICE_URL:
      'https://finnigramuser-service-production-139b.up.railway.app/api',
    MESSAGE_SERVICE_URL:
      'https://finnigrammessage-service-production-bbe0.up.railway.app/api',
    REALTIME_SERVICE_URL:
      'https://finnigramrealtime-service-production-bd5c.up.railway.app',
    LOGGING: {
      level: 'ERROR', // Only errors in production
      categories: [], // No category filtering
      timestamp: false,
    },
  },
};

// Auto-detect environment or allow override
// const environment = __DEV__ ? 'development' : 'production';

// For testing production services locally, temporarily force production:
const environment: keyof Config = 'production';

export const {
  USER_SERVICE_URL,
  MESSAGE_SERVICE_URL,
  REALTIME_SERVICE_URL,
  LOGGING,
} = config[environment];

export default config[environment];
