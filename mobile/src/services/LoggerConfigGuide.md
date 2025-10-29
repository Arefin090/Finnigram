# Finnigram Logging System Configuration Guide

## Overview

The new logging system provides configurable, environment-aware logging with category filtering and proper log levels.

## Quick Configuration

### 1. Environment-Based Configuration

Edit `/src/config/environment.js`:

```js
// Development: See everything
LOGGING: {
  level: 'DEBUG',           // NONE, ERROR, WARN, INFO, DEBUG, VERBOSE
  categories: ['AUTH'],     // Only show AUTH logs
  timestamp: true,
}

// Production: Only errors
LOGGING: {
  level: 'ERROR',           // Only show errors
  categories: [],           // All categories
  timestamp: false,
}
```

### 2. Available Log Levels

- `NONE` - No logging
- `ERROR` - Only errors  
- `WARN` - Warnings and errors
- `INFO` - Info, warnings, and errors
- `DEBUG` - Debug info and above
- `VERBOSE` - Everything

### 3. Built-in Categories

- `AUTH` - Authentication/login/logout
- `NETWORK` - API calls and responses
- `SOCKET` - WebSocket connections
- `NAVIGATION` - Screen navigation
- `STATE` - State changes
- `PERFORMANCE` - Timing and metrics

## Usage Examples

### Basic Logging

```js
import logger from '../services/loggerConfig';

// Category-based logging
logger.auth('User logged in successfully');
logger.network('API call completed');
logger.socket('Connection established');
logger.error('AUTH', 'Login failed:', error);
```

### Grouped Logging

```js
logger.group('🚪 Logout Process');
logger.auth('Starting logout...');
logger.auth('API call successful');
logger.groupEnd();
```

### Performance Timing

```js
logger.time('logout-process');
// ... do logout work
logger.timeEnd('logout-process');
```

## Runtime Configuration

### Global Logger Access (Development Only)

```js
// In development, you can access logger globally
__FINNIGRAM_LOGGER__.setLogLevel('VERBOSE');
__FINNIGRAM_LOGGER__.enableCategory('NETWORK');
```

### Programmatic Configuration

```js
import { configureLogging, LOG_LEVELS } from '../services/logger';

configureLogging({
  level: LOG_LEVELS.DEBUG,
  categories: ['AUTH', 'NETWORK'],
  timestamp: true
});
```

## Production Settings

### Recommended Production Config

```js
LOGGING: {
  level: 'ERROR',     // Only show errors
  categories: [],     // All categories (no filtering)
  timestamp: false,   // Clean logs
}
```

### Complete Silence

```js
LOGGING: {
  level: 'NONE',      // No logging at all
  categories: [],
  timestamp: false,
}
```

## Category Filtering Examples

### Show Only Authentication Logs

```js
LOGGING: {
  level: 'DEBUG',
  categories: ['AUTH'],  // Only AUTH category
  timestamp: true,
}
```

### Show Auth + Network (Common for debugging API issues)

```js
LOGGING: {
  level: 'DEBUG',
  categories: ['AUTH', 'NETWORK'],
  timestamp: true,
}
```

### Show Everything Except Verbose State Changes

```js
LOGGING: {
  level: 'DEBUG',        // DEBUG level excludes VERBOSE
  categories: [],        // All categories
  timestamp: true,
}
```

## Migration from console.log

### Before

```js
console.log('Starting logout process...');
console.error('Logout error:', error);
```

### After  

```js
logger.auth('Starting logout process...');
logger.error('AUTH', 'Logout error:', error);
```

## Advanced Features

### Custom Categories

```js
logger.debug('CUSTOM_FEATURE', 'Custom message');
logger.info('USER_ACTIONS', 'Button clicked');
```

### Conditional Logging

```js
if (__DEV__) {
  logger.verbose('DEBUG_INFO', 'Development-only details');
}
```

### Performance Monitoring

```js

logger.performance(`Logout completed in ${duration}ms`);
```

## Best Practices

1. **Use appropriate log levels**:
   - `error()` for actual errors
   - `warn()` for recoverable issues  
   - `info()` for important events
   - `debug()` for development info

2. **Use consistent categories**:
   - Group related functionality
   - Keep category names short and clear

3. **Include context in messages**:
   - User IDs, request IDs, timestamps
   - Relevant data for debugging

4. **Configure for environment**:
   - Development: DEBUG level with categories
   - Production: ERROR level only

## Current Configuration Status

Check current config with:

```js
logger.getConfig()
```

Returns:

```js
{
  level: 4,                    // Current log level
  enabledCategories: ['AUTH'], // Active categories  
  timestamp: true              // Timestamp setting
}
```
