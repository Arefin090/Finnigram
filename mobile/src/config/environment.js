// Environment configuration for Finnigram
const config = {
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
const environment = 'production';

export const {
  USER_SERVICE_URL,
  MESSAGE_SERVICE_URL,
  REALTIME_SERVICE_URL,
  LOGGING,
} = config[environment];

export default config[environment];
